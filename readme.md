# KOKO Diamond Hands Analyzer

A high-performance tool to analyze KOKO token holders on Solana and identify "diamond hands" - holders who meet strict holding criteria for potential airdrops.

## Features

- 🚀 High-performance parallel processing of on-chain data
- 💾 Transaction history caching for faster re-runs
- 📊 Real-time progress tracking and analytics
- 📝 Live CSV updates with detailed holder information
- 🎨 Beautiful CLI interface with progress indicators
- ⚡ Optimized RPC calls with rate limiting and retry logic

## Prerequisites

- Node.js v16 or higher
- NPM v7 or higher
- A Solana RPC endpoint (default uses QuickNode)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/koko-diamond-analyzer
cd koko-diamond-analyzer
```

2. Install dependencies:
```bash
npm install
```

3. Configure your settings in `src/config.js`:
```javascript
export const CONFIG = {
    RPC_ENDPOINT: 'your-rpc-endpoint',
    MIN_TOKENS: 50_000_000, // Minimum KOKO tokens required
    KOKO_TOKEN: 'FsA54yL49WKs7rWoGv9sUcbSGWCWV756jTD349e6H2yW',
    MONTHS_REQUIRED: 3, // Minimum holding period in months
    // ... other settings
};
```

## Usage

Run the analyzer:
```bash
npm start
```

The tool will:
1. Fetch all KOKO token holders
2. Analyze transaction history for each holder
3. Generate a CSV report on your desktop
4. Display summary statistics

## Eligibility Criteria

A wallet is considered eligible for the airdrop if it meets ALL of the following criteria:
- Holds at least 50,000,000 KOKO tokens
- Has held tokens for at least 3 months
- Has NEVER sold any KOKO tokens

## Output

The analyzer generates a detailed CSV file with the following information for each holder:
- Wallet address
- Current KOKO balance
- Maximum amount ever held
- Airdrop share percentage (for eligible holders)
- First acquisition date
- Holding duration
- Sale history
- Eligibility status and reason

## Project Structure

```
src/
├── analyzers/
│   └── diamond-hands-analyzer.js
├── services/
│   └── solana-service.js
├── utils/
│   ├── logger.js
│   ├── csv-writer.js
│   └── cache-manager.js
├── config.js
└── index.js
```

## Performance Optimizations

- Parallel transaction processing
- RPC request batching
- Transaction history caching
- Memory-efficient processing
- Rate limiting to prevent RPC throttling

## Error Handling

The tool includes comprehensive error handling:
- RPC connection failures
- Transaction parsing errors
- Rate limiting
- Data validation
- File system operations

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Disclaimer

This tool is provided as-is. Always verify the results and test with small datasets first. The authors are not responsible for any issues arising from the use of this tool.