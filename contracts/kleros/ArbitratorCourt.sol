pragma solidity ^0.4.15;

import "@kleros/kleros-interaction/contracts/standard/arbitration/Arbitrator.sol";

/**
 *  @title ArbitratorCourt
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice An Arbitrator court in a tree of courts.
 */
contract ArbitratorCourt is Arbitrator {
    /* Structs */

    struct Court {
        string name;
        Arbitrator _address;
    }

    /* Events */

    /**
     * @dev Called whenever the `parent` court changes for off-chain handling.
     * @param _prevParentName The previous `parent`'s name.
     * @param _prevParentAddress The previous `parent`'s address.
     * @param _nextParentName The next `parent`'s name.
     * @param _nextParentAddress The next `parent`'s address.
     */
    event OnParentChange(string _prevParentName, Arbitrator _prevParentAddress, string _nextParentName, Arbitrator _nextParentAddress);

    /**
     * @dev Called whenever a sub court is added.
     * @param _subCourtIndex The subcourt's index in this court.
     * @param _subCourtName The subcourt's name.
     * @param _subCourtAddress The subcourt's address.
     */
    event OnSubCourtAdd(uint256 _subCourtIndex, string _subCourtName, Arbitrator _subCourtAddress);

    /**
     * @dev Called whenever a sub court is removed.
     * @param _subCourtIndex The subcourt's index in this court.
     * @param _subCourtName The subcourt's name.
     * @param _subCourtAddress The subcourt's address.
     */
    event OnSubCourtRemove(uint256 _subCourtIndex, string _subCourtName, Arbitrator _subCourtAddress);

    /* Storage */

    // Owner metadata
    address public owner = msg.sender;

    // Courts
    Court parent; // Appeal to this arbitrator if it is set, otherwise reject appeal and finalize decision.
    Court[] subCourts;

    /* Modifiers */

    /**
     *  @dev Makes a function only callable by the owner of this contract.
     */
    modifier onlyOwner {
        require(owner == msg.sender, "Only the owner can call this function.");
        _;
    }

    /* Constructor */

    /**
     *  @dev Constructs the arbitrator court with an initial parent.
     *  @param _parentName The name of the `parent`.
     *  @param _parentAddress The address of the `parent`.
     */
    constructor(string _parentName, Arbitrator _parentAddress) public {
        parent = Court({ name: _parentName, _address: _parentAddress });
    }

    /* External */

    /**
     * @dev Sets the `parent` court.
     * @param _nextParentName The next `parent`'s name.
     * @param _nextParentAddress The next `parent`'s address.
     */
    function setParent(string _nextParentName, Arbitrator _nextParentAddress) external onlyOwner {
        // Emit event before overwriting `parent`
        emit OnParentChange(parent.name, parent._address, _nextParentName, _nextParentAddress);

        // Overwrite `parent`
        parent = Court({ name: _nextParentName, _address: _nextParentAddress });
    }

    /**
     * @dev Adds a new sub court.
     * @param _subCourtName The subcourt's name.
     * @param _subCourtAddress The subcourt's address.
     */
    function addSubCourt(string _subCourtName, Arbitrator _subCourtAddress) external onlyOwner {
        uint256 _index = subCourts.push(Court({ name: _subCourtName, _address: _subCourtAddress })) - 1;
        emit OnSubCourtAdd(_index, _subCourtName, _subCourtAddress);
    }

    /**
     * @dev Removes a sub court.
     * @param _subCourtIndex The subcourt's index.
     */
    function removeSubCourt(uint256 _subCourtIndex) external onlyOwner {
        require(_subCourtIndex >= 0 && _subCourtIndex < subCourts.length, "Index out of range.");

        emit OnSubCourtRemove(_subCourtIndex, subCourts[_subCourtIndex].name, subCourts[_subCourtIndex]._address);

        // Remove from subCourts array
        for (uint256 i = _subCourtIndex; i < subCourts.length; i++) subCourts[i] = subCourts[i + 1];
        subCourts.length--;
    }
}
