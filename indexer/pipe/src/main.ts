import {In} from 'typeorm'
import {TypeormDatabase} from '@subsquid/typeorm-store'
import * as erc20 from './abi/erc20'
import {Account, Transfer} from './model'
import {chain, tokenAddresses, Context, processor} from './processor'

processor.run(new TypeormDatabase({
    supportHotBlocks: true,
    stateSchema: `${chain}_processor`,
    isolationLevel: 'READ COMMITTED'
}), async (ctx) => {
    let transfersData: TransferEventData[] = []

    for (let block of ctx.blocks) {
        for (let log of block.logs) {
            if (log.topics[0] !== erc20.events.Transfer.topic) continue

            let event = erc20.events.Transfer.decode(log)
            transfersData.push({
                id: `${chain}-${log.id}`, // Avoid cross-chain collisions
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

async function saveTransfers(ctx: Context, transfersData: TransferEventData[]) {
    let accountIds = new Set<string>()

    for (let t of transfersData) {
        accountIds.add(t.from)
        accountIds.add(t.to)
    }

    let accounts = await ctx.store
        .findBy(Account, {id: In([...accountIds])})
        .then((q) => new Map(q.map((i) => [i.id, i])))

    let transfers: Transfer[] = []

    for (let t of transfersData) {
        let {id, blockNumber, timestamp, txHash, amount, tokenAddress} = t

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
}

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
