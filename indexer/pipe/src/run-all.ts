import { spawn } from 'child_process'
import * as path from 'path'

const chains = ['ethereum', 'base', 'arbitrum', 'bsc']

console.log(`Starting processors for: ${chains.join(', ')}...`)

chains.forEach(chain => {
    const child = spawn('node', [path.join(__dirname, 'main.js'), chain], {
        stdio: 'inherit',
        env: process.env
    })

    child.on('close', (code) => {
        console.log(`Processor for ${chain} exited with code ${code}`)
        if (code !== 0) {
            process.exit(code || 1)
        }
    })
})
