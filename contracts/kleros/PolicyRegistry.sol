pragma solidity ^0.4.24;

/**
 *  @title PolicyRegistry
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A contract to maintain a list of all policies for each subcourt.
 */
contract PolicyRegistry {
    /* Structs */

    struct Policy {
        string fileURI;
        bytes32 fileHash;
        bool deleted;
    }

    /* Events */

    /** @dev Emitted when a new policy is created.
     *  @param _subcourtID The ID of the policy's subcourt.
     *  @param _policyID The ID of the policy.
     */
    event PolicyCreation(uint indexed _subcourtID, uint indexed _policyID);

    /** @dev Emitted when a new policy is deleted.
     *  @param _subcourtID The ID of the policy's subcourt.
     *  @param _policyID The ID of the policy.
     */
    event PolicyDeletion(uint indexed _subcourtID, uint indexed _policyID);

    /* Storage */

    address public governor;
    mapping(uint => Policy[]) internal policies;

    /* Modifiers */

    /** @dev Requires that the sender is the governor. */
    modifier onlyByGovernor() {require(governor == msg.sender, "Can only be called by the governor."); _;}

    /* Constructor */

    /** @dev Constructs the PolicyRegistry contract.
     *  @param _governor The governor's address.
     */
    constructor(address _governor) public {governor = _governor;}

    /* External */

    /** @dev Changes the `governor` storage variable.
     *  @param _governor The new value for the `governor` storage variable.
     */
    function changeGovernor(address _governor) external onlyByGovernor {governor = _governor;}

    /** @dev Creates a policy for the specified subcourt.
     *  @param _subcourtID The ID of the specified subcourt.
     *  @param _fileURI The URI to the file containing the policy text.
     *  @param _fileHash The hash of the file's contents.
     */
    function createPolicy(uint _subcourtID, string _fileURI, bytes32 _fileHash) external onlyByGovernor {
        emit PolicyCreation(
            _subcourtID,
            policies[_subcourtID].push(Policy({
                fileURI: _fileURI,
                fileHash: _fileHash,
                deleted: false
            })) - 1
        );
    }

    /** @dev Deletes the specified policy for the specified subcourt.
     *  @param _subcourtID The ID of the specified subcourt.
     *  @param _policyID The ID of the specified policy.
     */
    function deletePolicy(uint _subcourtID, uint _policyID) external onlyByGovernor {
        policies[_subcourtID][_policyID].deleted = true;
        emit PolicyDeletion(_subcourtID, _policyID);
    }

    /* Public Views */

    /** @dev Gets the specified policy for the specified subcourt.
     *  @param _subcourtID The ID of the specified subcourt.
     *  @param _policyID The ID of the specified policy.
     *  @return The policy.
     */
    function policy(uint _subcourtID, uint _policyID) public view returns(string fileURI, bytes32 fileHash, bool deleted) {
        fileURI = policies[_subcourtID][_policyID].fileURI;
        fileHash = policies[_subcourtID][_policyID].fileHash;
        deleted = policies[_subcourtID][_policyID].deleted;
    }
}
