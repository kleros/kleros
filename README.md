# Kleros

[![Join the chat at https://gitter.im/kleros/kleros](https://badges.gitter.im/kleros/kleros.svg)](https://gitter.im/kleros/kleros?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

# Kleros Smart Contracts

## Prerequisites
Install [yarn](https://yarnpkg.com/lang/en/), [Truffle Suite](https://truffleframework.com/) and [Ganache](https://truffleframework.com/ganache)

* `yarn add global truffle`

## Get Started
* `git clone https://github.com/kleros/kleros`
* `cd kleros`
* `yarn`
* Make sure you have the MetaMask Chrome extension installed and are logged in.

### Migrate to local blockchain
Ensure you have Ganache running.
* `yarn migrate`

### Deploy to Kovan testnet
* `yarn deploy`

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

## Contributing
Check out [Contributing](CONTRIBUTING.md)

We follow [GitHub Flow](https://guides.github.com/introduction/flow/) in this repository.

Please see [smart contract guidelines](https://github.com/kleros/kleros/wiki/Guidelines-contracts).

Feel free to ask for help on [slack](https://slack.kleros.io/).
