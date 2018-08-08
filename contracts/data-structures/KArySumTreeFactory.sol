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

    mapping(bytes32 => KArySumTree) KArySumTrees;

    /* Internal */

    /**
     *  @dev Create a k-ary sum tree at the specified key.
     *  @param _key The key of the new tree.
     *  @param _K The number of children each node in the tree should have.
     */
    function createKArySumTree(bytes32 _key, uint _K) internal {
        KArySumTrees[_key].K = _K;
        KArySumTrees[_key].stack.length = 0;
        KArySumTrees[_key].tree.length = 0;
    }

    /**
     *  @dev Delete a k-ary sum tree at the specified key.
     *  @param _key The key of the tree to delete.
     */
    function deleteKArySumTree(bytes32 _key) internal {
        KArySumTrees[_key].K = 0;
        KArySumTrees[_key].stack.length = 0;
        KArySumTrees[_key].tree.length = 0;
        delete KArySumTrees[_key];
    }

    /**
     *  @dev Append a value to a tree.
     *  @param _key The key of the tree to append to.
     *  @param _value The value to append.
     *  @return treeIndex The index of the appended value in the tree.
     */
    function append(bytes32 _key, uint _value) internal returns(uint treeIndex) {
        KArySumTree storage tree = KArySumTrees[_key];

        if (tree.stack.length == 0) { // No vacant spots
            // Get the index and append the value
            treeIndex = tree.tree.length;
            tree.tree.length++;
            tree.tree[treeIndex] = _value;

            // Potentially append a new node and make the parent a sum node
            if (treeIndex % tree.K == 0) { // Is first child
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
        while (true) {
            parentIndex = (parentIndex - 1) / tree.K;
            tree.tree[parentIndex] += _value;
            if (parentIndex == 0) break;
        }
    }

    /**
     *  @dev Remove a value from a tree.
     *  @param _key The key of the tree to remove from.
     *  @param _treeIndex The index of the value to remove.
     */
    function remove(bytes32 _key, uint _treeIndex) internal {
        KArySumTree storage tree = KArySumTrees[_key];

        // Remember value and set to 0
        uint _value = tree.tree[_treeIndex];
        tree.tree[_treeIndex] = 0;

        // Push to stack
        tree.stack.length++;
        tree.stack[tree.stack.length - 1] = _treeIndex;

        // Update parents
        uint parentIndex = _treeIndex;
        while (true) {
            parentIndex = (parentIndex - 1) / tree.K;
            tree.tree[parentIndex] -= _value;
            if (parentIndex == 0) break;
        }
    }

    /* Internal Views */

    

}
