pragma solidity ^0.4.24;

import "./SortitionSumTreeFactory.sol";

/**
 *  @title ExposedSortitionSumTreeFactory
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Exposed version of SortitionSumTreeFactory for testing.
 */
contract ExposedSortitionSumTreeFactory {
    /* Storage */

    using SortitionSumTreeFactory for SortitionSumTreeFactory.SortitionSumTrees;
    SortitionSumTreeFactory.SortitionSumTrees internal sortitionSumTrees;

    /**
     *  @dev Public getter for sortitionSumTrees.
     *  @param _key The key of the tree to get.
     *  @return All of the tree's properties.
     */
    function _sortitionSumTrees(bytes32 _key) public view returns(uint K, uint[] stack, uint[] nodes) {
        return (
            sortitionSumTrees.sortitionSumTrees[_key].K,
            sortitionSumTrees.sortitionSumTrees[_key].stack,
            sortitionSumTrees.sortitionSumTrees[_key].nodes
        );
    }

    /* Public */

    /**
     *  @dev Create a sortition sum tree at the specified key.
     *  @param _key The key of the new tree.
     *  @param _K The number of children each node in the tree should have.
     */
    function _createTree(bytes32 _key, uint _K) public {
        sortitionSumTrees.createTree(_key, _K);
    }

    /**
     *  @dev Set a value of a tree.
     *  @param _key The key of the tree.
     *  @param _value The new value.
     *  @param _ID The ID of the value.
     */
    function _set(bytes32 _key, uint _value, bytes32 _ID) public {
        sortitionSumTrees.set(_key, _value, _ID);
    }

    /* Public Views */

    /**
     *  @dev Query the leaves of a tree.
     *  @param _key The key of the tree to get the leaves from.
     *  @param _cursor The pagination cursor.
     *  @param _count The number of items to return.
     *  @return The index at which leaves start, the values of the returned leaves, and whether there are more for pagination.
     */
    function _queryLeafs(bytes32 _key, uint _cursor, uint _count) public view returns(uint startIndex, uint[] values, bool hasMore) {
        return sortitionSumTrees.queryLeafs(_key, _cursor, _count);
    }

    /**
     *  @dev Draw an ID from a tree using a number.
     *  @param _key The key of the tree.
     *  @param _drawnNumber The drawn number.
     *  @return The drawn ID.
     */
    function _draw(bytes32 _key, uint _drawnNumber) public view returns(bytes32 ID) {
        return sortitionSumTrees.draw(_key, _drawnNumber);
    }

    /** @dev Gets a specified candidate's associated value.
     *  @param _key The key of the tree.
     *  @param _ID The ID of the value.
     *  @return The associated value.
     */
    function _stakeOf(bytes32 _key, bytes32 _ID) public view returns(uint value) {
        return sortitionSumTrees.stakeOf(_key, _ID);
    }
}
