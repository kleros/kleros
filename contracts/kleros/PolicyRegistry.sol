pragma solidity ^0.4.24;

/**
 *  @title PolicyRegistry
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A contract to maintain a list of all policies for each subcourt.
 */
contract PolicyRegistry {
    /* Structs */

    struct Policy {
        string fileURL;
        bytes32 fileHash;
    }
    struct PolicyList {
        Policy[] policies;
        uint[] vacantPoliciesListIndexes;
    }

    /* Storage */

    address public governor;
    mapping(address => mapping(uint => PolicyList)) internal policyLists;

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

    /** @dev Creates a policy for the specified subcourt in the specified contract.
     *  @param _address The address of the specified contract.
     *  @param _subcourtID The ID of the specified subcourt.
     *  @param _fileURL The URL to the file containing the policy text.
     *  @param _fileHash The hash of the file's contents.
     */
    function createPolicy(address _address, uint _subcourtID, string _fileURL, bytes32 _fileHash) external onlyByGovernor {
        PolicyList storage policyList = policyLists[_address][_subcourtID];
        if (policyList.vacantPoliciesListIndexes.length > 0)
            policyList.policies[policyList.vacantPoliciesListIndexes[--policyList.vacantPoliciesListIndexes.length]] = Policy({ fileURL: _fileURL, fileHash: _fileHash });
        else
            policyList.policies.push(Policy({ fileURL: _fileURL, fileHash: _fileHash }));
    }

    /** @dev Deletes the specified policy for the specified subcourt in the specified contract.
     *  @param _address The address of the specified contract.
     *  @param _subcourtID The ID of the specified subcourt.
     *  @param _policyID The ID of the specified policy.
     */
    function deletePolicy(address _address, uint _subcourtID, uint _policyID) external onlyByGovernor {
        PolicyList storage policyList = policyLists[_address][_subcourtID];
        delete policyList.policies[_policyID];
        policyList.vacantPoliciesListIndexes.push(_policyID);
    }

    /* Public Views */

    /** @dev Gets the specified policy for the specified subcourt in the specified contract.
     *  @param _address The address of the specified contract.
     *  @param _subcourtID The ID of the specified subcourt.
     *  @param _policyID The ID of the specified policy.
     */
    function policy(address _address, uint _subcourtID, uint _policyID) public view returns(string fileURL, bytes32 fileHash) {
        Policy storage _policy = policyLists[_address][_subcourtID].policies[_policyID];
        fileURL = _policy.fileURL;
        fileHash = _policy.fileHash;
    }
}
