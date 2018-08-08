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

    /* Internal Views */



}
