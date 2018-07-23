## This contract implements the Kleros arbitrator.
`Arbitrator` contracts can arbitrate `Arbitable` ones.

### The general logic is the following
The full logic cycle for a batch of disputes runs in a single session the length of which is approximately 3.5 days. A single session is divided into five periods.
1. To have the chance of being drawn a juror deposits Pinakion during `Period.Activation`
2. A random number is picked during `Period.Draw` and the judges are drawn based on it
3. Jurors submit their voting decisions during `Period.Vote`
4. Losing parties in the dispute can appeal during `Period.Appeal`
5. Pinakion is redistributed during `Period.Execution` based on how the Jurors voted

### General notes
- Jurors must restake their Pinakion on each new session.
- We have a web UI for both jurors and `Abritable` parties. They can be found at https://juror.kleros.io/ and https://escrow.kleros.io/ respectively.
- A full walktrough of the Kleros system from the eyes of a user can be seen at https://www.youtube.com/watch?v=PhjcjtYRiDs&t. We recommend you to watch it in order to get a good feel of how the arbitration process works.

### Notes on security
- With numeric operations we don't use SafeMath on purpose, as it is redundant in the majority of cases.
- In many cases,  instead of `transfer` we use `send` (and don't check the result) to prevent intentional blocking of the contract.
- In this release, the random number can be seen by miners before anyone else and is not fully secure. We will fix that in the future with our own RNG generation protocol. The details of it are available in the Kleros whitepaper.
- The governor contract will be a team controlled address in the beginning until we switch it to a liquid voting mechanism. The governor has full control over the Kleros contract.
