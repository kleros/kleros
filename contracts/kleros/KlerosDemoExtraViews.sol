/**
 *  https://contributing.kleros.io/smart-contract-workflow
 *  @authors: [@fnanni-0]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */
pragma solidity ^0.4.24;

import { KlerosDemoCourt } from "./KlerosDemoCourt.sol";

/**
 *  @title KlerosDemoExtraViews
 *  @dev Extra view functions for KlerosDemoCourt. Not part of bug bounty.
 */
contract KlerosDemoExtraViews {
    /* Storage */

    KlerosDemoCourt public klerosDemo;
    uint private constant NOT_FOUND = uint(-1);

    /* Constructor */

    /** @dev Constructs the KlerosDemoExtraViews contract.
     *  @param _klerosDemo The address of KlerosDemoCourt.
     */
    constructor(KlerosDemoCourt _klerosDemo) public {
        klerosDemo = _klerosDemo;
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
        subcourtIDs = new uint96[](klerosDemo.MAX_STAKE_PATHS());
        (stakedTokens, lockedTokens) = klerosDemo.jurors(_account);
        subcourtStakes = new uint[](klerosDemo.MAX_STAKE_PATHS());

        uint96[] memory actualSubcourtIDs = klerosDemo.getJuror(_account);
        for (uint i = 0; i < actualSubcourtIDs.length; i++) {
            subcourtIDs[i] = actualSubcourtIDs[i] + 1;
            subcourtStakes[i] = klerosDemo.stakeOf(_account, actualSubcourtIDs[i]);
        }
    }
}
