pragma solidity ^0.4.24;

import "./ExposedKArySumTreeFactory.sol";
import "./SortitionSumTreeFactory.sol";

/**
 *  @title ExposedSortitionSumTreeFactory
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Exposed version of SortitionSumTreeFactory for testing.
 */
contract ExposedSortitionSumTreeFactory is ExposedKArySumTreeFactory, SortitionSumTreeFactory {
    /* Public */

    /**
     *  @dev Delete a sortition sum tree at the specified key.
     *  @param _key The key of the tree to delete.
     */
    function _deleteTree(bytes32 _key) public {
        return deleteTree(_key);
    }

    /**
     *  @dev Append a value to a tree.
     *  @param _key The key of the tree to append to.
     *  @param _value The value to append.
     *  @param _address The candidate's address.
     *  @return The index of the appended value in the tree.
     */
    function _append(bytes32 _key, uint _value, address _address) public returns(uint treeIndex) {
        return append(_key, _value, _address);
    }

    /**
     *  @dev Remove a value from a tree.
     *  @param _key The key of the tree to remove from.
     *  @param _treeIndex The index of the value to remove.
     *  @param _address The candidate's address.
     */
    function _remove(bytes32 _key, uint _treeIndex, address _address) public {
        return remove(_key, _treeIndex, _address);
    }

    /**
     *  @dev Set a value of a tree.
     *  @param _key The key of the tree.
     *  @param _treeIndex The index of the value.
     *  @param _value The new value.
     *  @param _address The candidate's address.
     */
    function _set(bytes32 _key, uint _treeIndex, uint _value, address _address) public {
        return set(_key, _treeIndex, _value, _address);
    }

    /* Public Views */

    /**
     *  @dev Draw an address from a tree using a number.
     *  @param _key The key of the tree.
     *  @param _drawnNumber The drawn number.
     *  @return The drawn address.
     */
    function _draw(bytes32 _key, uint _drawnNumber) public view returns(address _address) {
        return draw(_key, _drawnNumber);
    }
}
