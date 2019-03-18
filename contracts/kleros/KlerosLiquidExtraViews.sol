/**
 *  https://contributing.kleros.io/smart-contract-workflow
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */
pragma solidity ^0.4.24;

import { KlerosLiquid } from "./KlerosLiquid.sol";

/**
 *  @title KlerosLiquidExtraViews
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Extra view functions for KlerosLiquid. Not part of bug bounty.
 */
contract KlerosLiquidExtraViews {
    /* Storage */

    KlerosLiquid public klerosLiquid;

    /* Constructor */

    /** @dev Constructs the KlerosLiquidExtraViews contract.
     *  @param _klerosLiquid The address of KlerosLiquid.
     */
    constructor(KlerosLiquid _klerosLiquid) public {
        klerosLiquid = _klerosLiquid;
    }

    /* External Views */

    /** @dev Gets the stake of a specified juror in a specified subcourt, taking into account delayed set stakes.
     *  @param _account The address of the juror.
     *  @param _subcourtID The ID of the subcourt.
     *  @return The stake.
     */
    function stakeOf(address _account, uint96 _subcourtID) external view returns(uint stake) {
        (
            uint96[] memory subcourtIDs,
            ,
            ,
            uint[] memory subcourtStakes
        ) = getJuror(_account);
        for (uint i = 0; i < subcourtIDs.length; i++) {
            if (_subcourtID + 1 == subcourtIDs[i]) {
                stake = subcourtStakes[i];
            }
        }
    }

    /* Public Views */

    /** @dev Gets a specified juror's properties, taking into account delayed set stakes. Note that subcourt IDs are shifted by 1 so that 0 can be "empty".
     *  @param _account The address of the juror.
     *  @return The juror's properties, taking into account delayed set stakes.
     */
    function getJuror(address _account) public view returns(
        uint96[] subcourtIDs,
        uint stakedTokens,
        uint lockedTokens,
        uint[] subcourtStakes
    ) {
        subcourtIDs = new uint96[](klerosLiquid.MAX_STAKE_PATHS());
        (stakedTokens, lockedTokens) = klerosLiquid.jurors(_account);
        subcourtStakes = new uint[](klerosLiquid.MAX_STAKE_PATHS());

        uint96[] memory actualSubcourtIDs = klerosLiquid.getJuror(_account);
        for (uint i = 0; i < actualSubcourtIDs.length; i++) {
            subcourtIDs[i] = actualSubcourtIDs[i] + 1;
            subcourtStakes[i] = klerosLiquid.stakeOf(_account, actualSubcourtIDs[i]);
        }

        for (i = klerosLiquid.nextDelayedSetStake(); i <= klerosLiquid.lastDelayedSetStake(); i++) {
            (address account, uint96 subcourtID, uint128 stake) = klerosLiquid.delayedSetStakes(i);
            if (_account == account) {
                if (stake == 0) {
                    for (uint j = 0; j < subcourtIDs.length; j++) {
                        if (subcourtID == subcourtIDs[j]) {
                            subcourtIDs[j] = 0;
                            subcourtStakes[j] = 0;
                            break;
                        }
                    }
                } else {
                    for (j = 0; j < subcourtIDs.length * 2; j++) {
                        if ((j < subcourtIDs.length && subcourtID + 1 == subcourtIDs[j]) || (j >= subcourtIDs.length && subcourtIDs[j % subcourtIDs.length] == 0)) {
                            (
                                ,
                                ,
                                uint courtMinStake,
                                ,
                                ,
                            ) = klerosLiquid.courts(j % subcourtIDs.length);
                            if (
                                courtMinStake <= stake &&
                                klerosLiquid.pinakion().balanceOf(_account) >= stakedTokens - subcourtStakes[j % subcourtIDs.length] + stake
                            ) {
                                subcourtIDs[j % subcourtIDs.length] = subcourtID + 1;
                                stakedTokens = stakedTokens - subcourtStakes[j % subcourtIDs.length] + stake;
                                subcourtStakes[j % subcourtIDs.length] = stake;
                            }
                        }
                    }
                }
            }
        }
    }
}
