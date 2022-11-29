<p align="center">
  <b style="font-size: 32px;">Kleros</b>
</p>

<p align="center">
  <a href="https://standardjs.com"><img src="https://img.shields.io/badge/code_style-standard-brightgreen.svg" alt="JavaScript Style Guide"></a>
  <a href="https://github.com/trufflesuite/truffle"><img src="https://img.shields.io/badge/tested%20with-truffle-red.svg" alt="Tested with Truffle"></a>
  <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg" alt="Conventional Commits"></a>
  <a href="http://commitizen.github.io/cz-cli/"><img src="https://img.shields.io/badge/commitizen-friendly-brightgreen.svg" alt="Commitizen Friendly"></a>
  <a href="https://github.com/prettier/prettier"><img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with Prettier"></a>
</p>


Smart Contracts for Kleros v1

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

#### Mainnet

- [PNK](https://etherscan.io/address/0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d)
- [KlerosGovernor](https://etherscan.io/address/0xe5bcEa6F87aAEe4a81f64dfDB4d30d400e0e5cf4)
- [KlerosLiquidExtraViews](https://etherscan.io/address/0xDa47f3252Bb03C5c7950d7Bb2Fd32637fC5Ad943)
- [KlerosLiquid](https://etherscan.io/address/0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069)
- [PolicyRegistry](https://etherscan.io/address/0xCf1f07713d5193FaE5c1653C9f61953D048BECe4)
- [SortitionSumTreeFactory](https://etherscan.io/address/0x180EBA68D164C3F8c3f6Dc354125EBccf4dfcB86)

#### Goerli

- [PNK](https://goerli.etherscan.io/token/0xA3B02bA6E10F55fb177637917B1b472da0110CcC)
- [ExposedSortitionSumTreeFactory](https://goerli.etherscan.io/address/0x67fe2D0d38DBF6dfdF359A5FEa7b7CD9a966FE53)
- [KlerosGovernor](https://goerli.etherscan.io/address/0x64f71bc0340f3b7bdbae6dcf69445a75b2de5943)
- [KlerosLiquidExtraViews](https://goerli.etherscan.io/address/0x7D78466AC0211400235696e114E342377045a84e)
- [KlerosLiquid](https://goerli.etherscan.io/address/0x56478d65A70E91E9653723B38971eC73bb0b357D)
- [PolicyRegistry](https://goerli.etherscan.io/address/0x4075a2C1cf212Ec386Ca79978B63afe1c168bB01)
- [SortitionSumTreeFactory](https://goerli.etherscan.io/address/0x17aA5CDbe970fB8C0FdfD9090F2883fF70c83DD8)

## Get Started

1.  Clone this repo.
2.  Install dependencies.

```bash
yarn install
```

### Run Tests

```bash
yarn test
```

### Compile the Contracts

```bash
yarn build
```

### Run Code Formatting on Files

```bash
yarn prettier
```

### Fix Code Styling Issues on Files

```bash
yarn lint
```

### Deploy Instructions

#### 0. Set the Environment Variables

Copy `.env.example` file as `.env` and edit it accordingly.

```bash
cp .env.example .env
```

The following env vars are required:

- `PRIVATE_KEY`: the private key of the deployer account used for the testnets.
- `MAINNET_PRIVATE_KEY`: the private key of the deployer account used for Mainnet.
- `INFURA_API_KEY`: the API key for infura.

#### 1. Update the Constructor Parameters (optional)

If some of the constructor parameters (such as the Meta Evidence) needs to change, you need to update the files in the `deploy/` directory.

#### 2. Deploy to a Local Network

Execute deploy scripts by running

**Shell 1: the node**

```bash
yarn node | hardhat deploy
```


**Shell 2: the deploy script**

```bash
yarn deploy --network localhost --tags <tag>
```

#### 3. Deploy to Public Testnets

```bash
# Goerli
yarn deploy --network goerli --tags KlerosLiquid
yarn deploy --network goerli --tags KlerosGovernor
```

The deployed addresses should be output to the screen after the deployment is complete.
If you miss that, you can always go to the `deployments/<network>` directory and look for the respective file.


## Contributing

See CONTRIBUTING.md.

Learn how to develop arbitrable and arbitrator contracts [here](https://erc-792.readthedocs.io/en/latest/).
