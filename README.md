# Kleros Smart Contracts

[![Join the chat at https://gitter.im/kleros/kleros](https://badges.gitter.im/kleros/kleros.svg)](https://gitter.im/kleros/kleros?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Getting Started

### Setting Up The Environment

Install [yarn](https://yarnpkg.com/lang/en/), [Truffle Suite](https://truffleframework.com/) and [Ganache](https://truffleframework.com/ganache)

### Running Tests

Install dependencies using `yarn` package manager:
```
yarn install
```
Compile the project using `Truffle` suite
```
truffle compile
```
Run tests
```
truffle test
```

## Troubleshooting
> Could not connect to your Ethereum client. Please check that your Ethereum client:
    - is running
    - is accepting RPC connections (i.e., "--rpc" option is used in geth)
    - is accessible over the network
    - is properly configured in your Truffle configuration file (truffle.js)

Make sure `Ganache` is running on the port specified in `truffle.js`

## Contributing

We follow [GitHub Flow](https://guides.github.com/introduction/flow/) in this repository.

Please see [smart contract guidelines](https://github.com/kleros/kleros/wiki/Guidelines-contracts).

Feel free to ask for help on [slack](https://slack.kleros.io/).
