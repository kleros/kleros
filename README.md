# Kleros

[![Join the chat at https://gitter.im/kleros/kleros](https://badges.gitter.im/kleros/kleros.svg)](https://gitter.im/kleros/kleros?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

# Kleros Smart Contracts

## Prerequisites
Install [yarn](https://yarnpkg.com/lang/en/), [Truffle Suite](https://truffleframework.com/) and [Ganache](https://truffleframework.com/ganache)

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

### Running Tests

Install dependencies using `yarn` package manager:
```
yarn
```
Compile the project using `Truffle` suite
```
truffle compile
```
Run tests
```
truffle test
```

## Testing
`npm test`

We'll reimplement the hackathonPOC smart contracts to cope with the change and the arbitration standard.
=======
## Troubleshooting
> Could not connect to your Ethereum client. Please check that your Ethereum client:
    - is running
    - is accepting RPC connections (i.e., "--rpc" option is used in geth)
    - is accessible over the network
    - is properly configured in your Truffle configuration file (truffle.js)

Make sure `Ganache` is running on the port specified in `truffle.js`

## Contributing
Check out [Contributing](CONTRIBUTING.md)

See [smart contract guidelines.](https://github.com/kleros/kleros/wiki/Guidelines-contracts)

You can ask for help on [slack](https://slack.kleros.io/).
