pragma solidity ^0.4.24;

import "./KArySumTreeFactory.sol";

/**
 *  @title ExposedKArySumTreeFactory
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Exposed version of KArySumTreeFactory for testing.
 */
contract ExposedKArySumTreeFactory is KArySumTreeFactory {
    /* Storage /*

    /**
     *  @dev Public getter for kArySumTrees.
     *  @param _key The key of the tree to get.
     *  @return All of the tree's properties.
     */
    function _kArySumTrees(bytes32 _key) public view returns(uint K, uint[] stack, uint[] tree) {
        return (kArySumTrees[_key].K, kArySumTrees[_key].stack, kArySumTrees[_key].tree);
    }

    /* Public */

    /**
     *  @dev Create a k-ary sum tree at the specified key.
     *  @param _key The key of the new tree.
     *  @param _K The number of children each node in the tree should have.
     */
    function _createKArySumTree(bytes32 _key, uint _K) public {
        return createKArySumTree(_key, _K);
    }

    /**
     *  @dev Delete a k-ary sum tree at the specified key.
     *  @param _key The key of the tree to delete.
     */
    function _deleteKArySumTree(bytes32 _key) public {
        return deleteKArySumTree(_key);
    }

    /**
     *  @dev Append a value to a tree.
     *  @param _key The key of the tree to append to.
     *  @param _value The value to append.
     *  @return The index of the appended value in the tree.
     */
    function _append(bytes32 _key, uint _value) public returns(uint treeIndex) {
        return append(_key, _value);
    }

    /**
     *  @dev Remove a value from a tree.
     *  @param _key The key of the tree to remove from.
     *  @param _treeIndex The index of the value to remove.
     */
    function _remove(bytes32 _key, uint _treeIndex) public {
        return remove(_key, _treeIndex);
    }

    /**
     *  @dev Set a value of the tree.
     *  @param _key The key of the tree.
     *  @param _treeIndex The index of the value.
     *  @param _value The new value.
     */
    function _set(bytes32 _key, uint _treeIndex, uint _value) public {
        return set(_key, _treeIndex, _value);
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
}
