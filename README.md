# Kleros

[![Join the chat at https://gitter.im/kleros/kleros](https://badges.gitter.im/kleros/kleros.svg)](https://gitter.im/kleros/kleros?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

# Kleros Smart Contracts

## Prerequisites
* `npm install -g truffle`
* `npm install -g solc`

## Get Started
* `git clone`
* `cd kleros`
* `npm install`
* Make sure you have the MetaMask Chrome extension installed and are logged in.

### Migrate to local blockchain
Ensure you have Ganache running.
* `npm migrate`

### Deploy to Kovan testnet
* `npm deploy`

Note that we need kleros-interaction:
```
yarn add kleros-interaction
```

## Contributing
Check out [Contributing](CONTRIBUTING.md)

## Testing
`npm test`

We'll reimplement the hackathonPOC smart contracts to cope with the change and the arbitration standard.
