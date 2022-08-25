const KlerosDemoCourt = artifacts.require("./kleros/KlerosDemoCourt.sol");

module.exports = function (deployer) {
    deployer.deploy(
        KlerosDemoCourt,
        "0x48936cf56a6cc74535c72430f22f54da12ae058e",
        "0xa3b02ba6e10f55fb177637917b1b472da0110ccc",
        "0x48936cf56a6cc74535c72430f22f54da12ae058e",
        false,
        "1000000000000000000",
        "10000",
        "1000000000000000",
        "1000",
        [900, 900, 900, 900]
    );
};

/** @dev Constructs the KlerosLiquid contract.
_governor 0x48936cf56a6cc74535C72430f22F54Da12Ae058E
_pinakion 0xA3B02bA6E10F55fb177637917B1b472da0110CcC
_instructor 0x48936cf56a6cc74535C72430f22F54Da12Ae058E
_hiddenVotes false // no blinded votes
_minStake 1000000000000000000 // 1 PNK with 18 decimals
_alpha 10000 // 100% of PNK stake lost when incoherent, in basis points
_feeForJuror 1000000000000000 // 0.001 ETH min per juror
_jurorsForCourtJump 1000 // we don't want to jump
_timesPerPeriod [900, 900, 900, 900] // 15 minutes for submitting evidence, voting, appealing.
 */
