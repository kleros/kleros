pragma solidity ^0.4.24;

/**
 *  @title KArySumTreeFactory
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A factory of k-ary sum trees.
 */
contract KArySumTreeFactory {
    /* Structs */

    struct KArySumTree {
        uint K;
        uint[] stack;
        uint[] tree;
    }

    /* Storage */

    mapping(bytes32 => KArySumTree) internal kArySumTrees;

    /* Internal */

    /**
     *  @dev Create a k-ary sum tree at the specified key.
     *  @param _key The key of the new tree.
     *  @param _K The number of children each node in the tree should have.
     */
    function createKArySumTree(bytes32 _key, uint _K) internal {
        kArySumTrees[_key].K = _K;
        kArySumTrees[_key].stack.length = 0;
        kArySumTrees[_key].tree.length = 0;
    }

    /**
     *  @dev Delete a k-ary sum tree at the specified key.
     *  @param _key The key of the tree to delete.
     */
    function deleteKArySumTree(bytes32 _key) internal {
        kArySumTrees[_key].K = 0;
        kArySumTrees[_key].stack.length = 0;
        kArySumTrees[_key].tree.length = 0;
        delete kArySumTrees[_key];
    }

    /**
     *  @dev Append a value to a tree.
     *  @param _key The key of the tree to append to.
     *  @param _value The value to append.
     *  @return The index of the appended value in the tree.
     */
    function append(bytes32 _key, uint _value) internal returns(uint treeIndex) {
        KArySumTree storage tree = kArySumTrees[_key];

        if (tree.stack.length == 0) { // No vacant spots
            // Get the index and append the value
            treeIndex = tree.tree.length;
            tree.tree.length++;
            tree.tree[treeIndex] = _value;

            // Potentially append a new node and make the parent a sum node
            if ((treeIndex - 1) % tree.K == 0) { // Is first child
                tree.tree.length++;
                tree.tree[treeIndex + 1] = tree.tree[treeIndex / tree.K];
            }
        } else { // Some vacant spot
            // Pop the stack and append the value
            treeIndex = tree.stack[tree.stack.length - 1];
            tree.stack.length--;
            tree.tree[treeIndex] = _value;
        }

        // Update parents
        uint parentIndex = treeIndex;
        while (parentIndex != 0) {
            parentIndex = (parentIndex - 1) / tree.K;
            tree.tree[parentIndex] += _value;
        }
    }

    /**
     *  @dev Remove a value from a tree.
     *  @param _key The key of the tree to remove from.
     *  @param _treeIndex The index of the value to remove.
     */
    function remove(bytes32 _key, uint _treeIndex) internal {
        KArySumTree storage tree = kArySumTrees[_key];

        // Remember value and set to 0
        uint _value = tree.tree[_treeIndex];
        tree.tree[_treeIndex] = 0;

        // Push to stack
        tree.stack.length++;
        tree.stack[tree.stack.length - 1] = _treeIndex;

        // Update parents
        uint parentIndex = _treeIndex;
        while (parentIndex != 0) {
            parentIndex = (parentIndex - 1) / tree.K;
            tree.tree[parentIndex] -= _value;
        }
    }

    /* Internal Views */

    /**
     *  @dev Query the leafs of a tree.
     *  @param _key The key of the tree to get the leafs from.
     *  @param _cursor The pagination cursor.
     *  @param _count The number of items to return.
     *  @return The index at which leafs start, the values of the returned leafs, and wether there are more for pagination.
     */
    function queryLeafs(bytes32 _key, uint _cursor, uint _count) internal view returns(uint startIndex, uint[] values, bool hasMore) {
        KArySumTree storage tree = kArySumTrees[_key];

        // Find the start index
        for (uint i = 0; i < tree.tree.length; i++) {
            if ((tree.K * i) + 1 >= tree.tree.length) {
                startIndex = i;
                break;
            }
        }

        // Get the values
        uint _startIndex = startIndex + _cursor;
        values = new uint[](_startIndex + _count > tree.tree.length ? tree.tree.length - _startIndex : _count);
        uint _valuesIndex = 0;
        for (uint j = _startIndex; j < tree.tree.length; j++) {
            if (_valuesIndex < _count) {
                values[_valuesIndex] = tree.tree[j];
                _valuesIndex++;
            } else {
                hasMore = true;
                break;
            }
        }
    }
}
