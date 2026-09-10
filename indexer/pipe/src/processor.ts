import { assertNotNull } from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import { Store } from '@subsquid/typeorm-store'
import * as erc20 from './abi/erc20'
import * as fs from 'fs'
import * as path from 'path'

// Get target chain from CLI args (default to ethereum)
export const chain = process.argv[2] || 'ethereum'

const GATEWAY_URLS: Record<string, string> = {
    ethereum: 'https://v2.archive.subsquid.io/network/ethereum-mainnet',
    base: 'https://v2.archive.subsquid.io/network/base-mainnet',
    arbitrum: 'https://v2.archive.subsquid.io/network/arbitrum-one',
    optimism: 'https://v2.archive.subsquid.io/network/optimism-mainnet',
    bsc: 'https://v2.archive.subsquid.io/network/binance-mainnet'
}

const START_BLOCKS: Record<string, number> = {
    ethereum: 25932900,
    base: 51042324,
    arbitrum: 503035230,
    // optimism: 153995292,
    bsc: 1788874596
}

const gatewayUrl = GATEWAY_URLS[chain]
const startBlock = START_BLOCKS[chain]

if (!gatewayUrl) {
    throw new Error(`Unsupported chain: ${chain}. Supported: ${Object.keys(GATEWAY_URLS).join(', ')}`)
}

// Load token addresses from flat JSON list
const tokensPath = path.join(__dirname, '../tokens.json')
if (!fs.existsSync(tokensPath)) {
    throw new Error(`Tokens file not found at ${tokensPath}`)
}
export const tokenAddresses: string[] = JSON.parse(fs.readFileSync(tokensPath, 'utf8')).map((addr: string) => addr.toLowerCase())

export const processor = new EvmBatchProcessor()
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
        from: startBlock
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Context = DataHandlerContext<Store, Fields>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
