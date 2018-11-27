pragma solidity ^0.4.24;

import "./SortitionSumTreeFactory.sol";

/**
 *  @title ExposedSortitionSumTreeFactory
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Exposed version of SortitionSumTreeFactory for testing.
 */
contract ExposedSortitionSumTreeFactory is SortitionSumTreeFactory {
    /* Storage /*

    /**
     *  @dev Public getter for sortitionSumTrees.
     *  @param _key The key of the tree to get.
     *  @return All of the tree's properties.
     */
    function _sortitionSumTrees(bytes32 _key) public view returns(uint K, uint[] stack, uint[] nodes) {
        return (sortitionSumTrees[_key].K, sortitionSumTrees[_key].stack, sortitionSumTrees[_key].nodes);
    }

    /* Public */

    /**
     *  @dev Create a sortition sum tree at the specified key.
     *  @param _key The key of the new tree.
     *  @param _K The number of children each node in the tree should have.
     */
    function _createTree(bytes32 _key, uint _K) public {
        createTree(_key, _K);
    }

    /**
     *  @dev Delete a sortition sum tree at the specified key.
     *  @param _key The key of the tree to delete.
     */
    function _deleteTree(bytes32 _key) public {
        deleteTree(_key);
    }

    /**
     *  @dev Append a value to a tree.
     *  @param _key The key of the tree to append to.
     *  @param _value The value to append.
     *  @param _ID The ID of the value.
     *  @return The index of the appended value in the tree.
     */
    function _append(bytes32 _key, uint _value, bytes32 _ID) public returns(uint treeIndex) {
        return append(_key, _value, _ID);
    }

    /**
     *  @dev Remove a value from a tree.
     *  @param _key The key of the tree to remove from.
     *  @param _ID The ID of the value.
     */
    function _remove(bytes32 _key, bytes32 _ID) public {
        remove(_key, _ID);
    }

    /**
     *  @dev Set a value of a tree.
     *  @param _key The key of the tree.
     *  @param _value The new value.
     *  @param _ID The ID of the value.
     */
    function _set(bytes32 _key, uint _value, bytes32 _ID) public {
        set(_key, _value, _ID);
    }

    /* Public Views */

    /**
     *  @dev Query the leafs of a tree.
     *  @param _key The key of the tree to get the leafs from.
     *  @param _cursor The pagination cursor.
     *  @param _count The number of items to return.
     *  @return The index at which leafs start, the values of the returned leafs, and wether there are more for pagination.
     */
    function _queryLeafs(bytes32 _key, uint _cursor, uint _count) public view returns(uint startIndex, uint[] values, bool hasMore) {
        return queryLeafs(_key, _cursor, _count);
    }

    /**
     *  @dev Draw an ID from a tree using a number.
     *  @param _key The key of the tree.
     *  @param _drawnNumber The drawn number.
     *  @return The drawn ID.
     */
    function _draw(bytes32 _key, uint _drawnNumber) public view returns(bytes32 ID) {
        return draw(_key, _drawnNumber);
    }

    /** @dev Gets a specified candidate's associated value.
     *  @param _key The key of the tree.
     *  @param _ID The ID of the value.
     *  @return The associated value.
     */
    function _stakeOf(bytes32 _key, bytes32 _ID) public view returns(uint value) {
        return stakeOf(_key, _ID);
    }
}
