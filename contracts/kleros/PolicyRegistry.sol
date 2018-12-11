pragma solidity ^0.4.24;

/**
 *  @title PolicyRegistry
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A contract to maintain a policy for each subcourt.
 */
contract PolicyRegistry {
    /* Structs */

    struct Policy {
        string fileURI;
        bytes32 fileHash;
    }

    /* Events */

    /** @dev Emitted when a policy is updated.
     *  @param _subcourtID The ID of the policy's subcourt.
     *  @param _fileURI The URI to the file containing the policy text.
     *  @param _fileHash The hash of the file's contents.
     */
    event PolicyUpdate(uint indexed _subcourtID, string _fileURI, bytes32 _fileHash);

    /* Storage */

    address public governor;
    mapping(uint => Policy) public policies;

    /* Modifiers */

    /** @dev Requires that the sender is the governor. */
    modifier onlyByGovernor() {require(governor == msg.sender, "Can only be called by the governor."); _;}

    /* Constructor */

    /** @dev Constructs the `PolicyRegistry` contract.
     *  @param _governor The governor's address.
     */
    constructor(address _governor) public {governor = _governor;}

    /* External */

    /** @dev Changes the `governor` storage variable.
     *  @param _governor The new value for the `governor` storage variable.
     */
    function changeGovernor(address _governor) external onlyByGovernor {governor = _governor;}

    /** @dev Sets the policy for the specified subcourt.
     *  @param _subcourtID The ID of the specified subcourt.
     *  @param _fileURI The URI to the file containing the policy text.
     *  @param _fileHash The hash of the file's contents.
     */
    function setPolicy(uint _subcourtID, string _fileURI, bytes32 _fileHash) external onlyByGovernor {
        Policy storage policy = policies[_subcourtID];
        emit PolicyUpdate(_subcourtID, policy.fileURI, policy.fileHash);
        policies[_subcourtID] = Policy({
            fileURI: _fileURI,
            fileHash: _fileHash
        });
    }
}
