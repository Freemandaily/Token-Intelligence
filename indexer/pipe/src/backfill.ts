import 'reflect-metadata'
import 'dotenv/config'
import {
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    DataHandlerContext
} from '@subsquid/evm-processor'
import { Store, TypeormDatabase } from '@subsquid/typeorm-store'
import { In } from 'typeorm'
import * as erc20 from './abi/erc20'
import { Account, Transfer } from './model'

const GATEWAY_URLS: Record<string, string> = {
    ethereum: 'https://v2.archive.subsquid.io/network/ethereum-mainnet',
    base: 'https://v2.archive.subsquid.io/network/base-mainnet',
    arbitrum: 'https://v2.archive.subsquid.io/network/arbitrum-one',
    optimism: 'https://v2.archive.subsquid.io/network/optimism-mainnet',
    bsc: 'https://v2.archive.subsquid.io/network/binance-mainnet'
}

interface BackfillJob {
    fromBlock: number
    toBlock: number
    chain: string
    tokenAddresses: string[]
}

async function runBackfillJob(job: BackfillJob) {
    const { fromBlock, toBlock, chain, tokenAddresses } = job
    const gatewayUrl = GATEWAY_URLS[chain]
    if (!gatewayUrl) {
        console.error(`Error: Unsupported chain: ${chain}. Supported: ${Object.keys(GATEWAY_URLS).join(', ')}`)
        process.exit(1)
    }

    console.log(`Starting historical backfill for ${chain}...`)
    console.log(`Block Range: ${fromBlock} to ${toBlock}`)
    console.log(`Tokens: ${tokenAddresses.join(', ')}`)

    const processor = new EvmBatchProcessor()
        .setGateway({
            url: gatewayUrl,
            apiKey: process.env.SQD_API_KEY
        })
        .setFinalityConfirmation(75)
        .setFields({
            log: {
                topics: true,
                data: true,
            },
            transaction: {
                hash: true,
            },
        })
        .addLog({
            address: tokenAddresses,
            topic0: [erc20.events.Transfer.topic],
            transaction: true,
        })
        .setBlockRange({
            from: fromBlock,
            to: toBlock
        })

    type Fields = EvmBatchProcessorFields<typeof processor>
    type Context = DataHandlerContext<Store, Fields>

    interface TransferEventData {
        id: string
        blockNumber: number
        timestamp: Date
        txHash: string
        from: string
        to: string
        amount: bigint
        tokenAddress: string
    }

    function getAccount(m: Map<string, Account>, id: string): Account {
        let acc = m.get(id)
        if (acc == null) {
            acc = new Account()
            acc.id = id
            m.set(id, acc)
        }
        return acc
    }

    async function saveTransfers(ctx: Context, transfersData: TransferEventData[]) {
        if (transfersData.length === 0) return

        let accountIds = new Set<string>()
        for (let t of transfersData) {
            accountIds.add(t.from)
            accountIds.add(t.to)
        }

        let accounts = await ctx.store
            .findBy(Account, { id: In([...accountIds]) })
            .then((q) => new Map(q.map((i) => [i.id, i])))

        let transfers: Transfer[] = []

        for (let t of transfersData) {
            let { id, blockNumber, timestamp, txHash, amount, tokenAddress } = t

            let from = getAccount(accounts, t.from)
            let to = getAccount(accounts, t.to)

            transfers.push(
                new Transfer({
                    id,
                    blockNumber,
                    timestamp,
                    txHash,
                    from,
                    to,
                    amount,
                    tokenAddress,
                    chain: chain
                })
            )
        }

        await ctx.store.upsert(Array.from(accounts.values()))
        await ctx.store.upsert(transfers)
        console.log(`Saved ${transfers.length} transfers on ${chain}.`)
    }

    await processor.run(new TypeormDatabase({
        supportHotBlocks: false,
        stateSchema: `${chain}_backfill_${fromBlock}_${toBlock}`,
        isolationLevel: 'READ COMMITTED'
    }), async (ctx) => {
        let transfersData: TransferEventData[] = []

        for (let block of ctx.blocks) {
            for (let log of block.logs) {
                if (log.topics[0] !== erc20.events.Transfer.topic) continue

                let event = erc20.events.Transfer.decode(log)
                transfersData.push({
                    id: `${chain}-${log.id}`,
                    blockNumber: block.header.height,
                    timestamp: new Date(block.header.timestamp),
                    txHash: log.transaction?.hash || '0x',
                    from: event.from.toLowerCase(),
                    to: event.to.toLowerCase(),
                    amount: event.value,
                    tokenAddress: log.address.toLowerCase()
                })
            }
        }

        await saveTransfers(ctx, transfersData)
    })
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length === 0) {
        console.error('Usage (Single chain): node lib/backfill.js <fromBlock> <toBlock> <chain> <token1> [token2] ...')
        console.error('Usage (Multi chain):  node lib/backfill.js <fromBlock>:<toBlock>:<chain>:<token1>,<token2> ...')
        process.exit(1)
    }

    const jobs: BackfillJob[] = []

    if (args[0].includes(':')) {
        // Multi-chain format: "from:to:chain:token1,token2"
        for (const arg of args) {
            const parts = arg.split(':')
            if (parts.length < 4) {
                console.error(`Error: Invalid format "${arg}". Expected format: fromBlock:toBlock:chain:token1,token2`)
                process.exit(1)
            }
            const fromBlock = parseInt(parts[0], 10)
            const toBlock = parseInt(parts[1], 10)
            const chain = parts[2].toLowerCase()
            const tokenAddresses = parts[3].split(',').map(addr => addr.trim().toLowerCase())

            if (isNaN(fromBlock) || isNaN(toBlock)) {
                console.error(`Error: Invalid block numbers in group: "${arg}"`)
                process.exit(1)
            }
            jobs.push({ fromBlock, toBlock, chain, tokenAddresses })
        }
    } else {
        // Single-chain format: fromBlock toBlock chain token1 token2 ...
        if (args.length < 4) {
            console.error('Usage: node lib/backfill.js <fromBlock> <toBlock> <chain> <token1> [token2] ...')
            process.exit(1)
        }
        const fromBlock = parseInt(args[0], 10)
        const toBlock = parseInt(args[1], 10)
        const chain = args[2].toLowerCase()
        const tokenAddresses = args.slice(3).map(addr => addr.toLowerCase())

        if (isNaN(fromBlock) || isNaN(toBlock)) {
            console.error('Error: fromBlock and toBlock must be valid numbers.')
            process.exit(1)
        }
        jobs.push({ fromBlock, toBlock, chain, tokenAddresses })
    }

    for (const job of jobs) {
        await runBackfillJob(job)
    }
}

main().catch((err) => {
    console.error('Backfill execution failed:', err)
    process.exit(1)
})
