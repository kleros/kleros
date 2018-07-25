## This contract implements the Kleros arbitrator.
`Arbitrator` contracts can arbitrate `Arbitable` ones as describded in [ERC792](https://github.com/ethereum/EIPs/issues/792).

### The general logic is the following
The full logic cycle for a batch of disputes runs in a single session the length of which is approximately 3.5 days. A single session is divided into five periods.
1. To have the chance of being drawn a juror deposits Pinakion during `Period.Activation`.
2. A random number is picked during `Period.Draw` and the judges are drawn based on it.
3. Jurors submit their voting decisions during `Period.Vote`.
4. Losing parties in the dispute can appeal during `Period.Appeal`.
5. Pinakion is redistributed during `Period.Execution` based on how the Jurors voted. This is also the period rulings are executed.

### General notes
- Jurors must restake their Pinakion on each new session.
- We have a web UI for both jurors and `Abritable` parties. They can be found at https://juror.kleros.io/ and https://escrow.kleros.io/ respectively.
- A full walktrough of the Kleros system from the eyes of a user can be seen at https://www.youtube.com/watch?v=PhjcjtYRiDs&t. We recommend you to watch it in order to get a good feel of how the arbitration process works. Note that in the cryptoeconomics test release, the disputes will be listing disputes and not escrow disputes to start with usecases with non critical failure modes.

### Notes on security
- With numeric operations we don't use SafeMath on purpose, as it is redundant (with lowering the value if it would lead to over/underflow) in the majority of cases and in some cases blocking the execution is a worse failure mode than an overflow.
- In many cases, we use `send` to prevent intentional blocking of the contract. This is the expected behaviour, it is smart contract responsability to make sure their fallback function does not revert / out-of-gas on `send`.
- In this release, we will use [a blockhash random number generator](https://github.com/kleros/kleros-interaction/edit/master/contracts/standard/rng/BlockhashRNGFallback.sol) which can be slightly manipulated by the miners (by block withholding and building upon the block of their choice in case of fork). We will use a more secure random number generation method in the future. But note that even with a blockhash RNG, miners can just reroll random numbers they don't like but not set them to a particular value. As the number of jurors increases (with appeals), it would be harder and harder to manipulate the RNG to create a set of juror statistically different from the underlying juror pool.
This RNG is part of another submission.
- In this release, the `Arbitrable` contract will be [an arbitrable curated list](https://github.com/kleros/kleros-interaction/blob/master/contracts/standard/permission/ArbitrablePermissionList.sol). If other disputes are created, jurors should refuse to arbitrate (vote 0).
This arbitrable curated list is part of another submission.
- In this realease, the governor is an address controlled by Kleros team. It will be switched to a liquid voting mechanism when contracts for this purpose will be ready. Note that it is not our intention to build a centralized or backdoored system but we prefer to release an early version for testing rather than to wait for the governance mechanism to be implemented. The governor has full control over the Kleros contract. We assume that this governor is honest and change parameters only when it does not lead to issues for the remaining parts of the contract.
- The Pinakion contract has already been deployed [there](https://etherscan.io/address/0x93ed3fbe21207ec2e8f2d3c3de6e058cb73bc04d).
