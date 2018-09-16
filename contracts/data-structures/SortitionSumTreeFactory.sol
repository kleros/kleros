pragma solidity ^0.4.24;

import "./KArySumTreeFactory.sol";

/**
 *  @title SortitionSumTreeFactory
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A factory of trees that keep track of staked values for sortition.
 */
contract SortitionSumTreeFactory is KArySumTreeFactory {
    /* Structs */

    struct SortitionSumTree {
        mapping(address => uint) addressesToTreeIndexes;
        mapping(uint => address) treeIndexesToAddresses;
    }

    /* Storage */

    mapping(bytes32 => SortitionSumTree) internal sortitionSumTrees;

    /* Internal */

    /**
     *  @dev Delete a sortition sum tree at the specified key.
     *  @param _key The key of the tree to delete.
     */
    function deleteTree(bytes32 _key) internal {
        super.deleteTree(_key);
        delete sortitionSumTrees[_key];
    }

    /**
     *  @dev Append a value to a tree.
     *  @param _key The key of the tree to append to.
     *  @param _value The value to append.
     *  @param _address The candidate's address.
     *  @return The index of the appended value in the tree.
     */
    function append(bytes32 _key, uint _value, address _address) internal returns(uint treeIndex) {
        require(sortitionSumTrees[_key].addressesToTreeIndexes[_address] == 0, "Address already has a value in this tree.");
        require(_value > 0, "The value must be greater than zero.");
        KArySumTree storage tree = kArySumTrees[_key];
        treeIndex = super.append(_key, _value);
        sortitionSumTrees[_key].addressesToTreeIndexes[_address] = treeIndex;
        sortitionSumTrees[_key].treeIndexesToAddresses[treeIndex] = _address;

        // Parent could have been turned into a sum node.
        if (treeIndex != 1 && (treeIndex - 1) % tree.K == 0) { // Is first child.
            uint _parentIndex = treeIndex / tree.K;
            address _parentAddress = sortitionSumTrees[_key].treeIndexesToAddresses[_parentIndex];
            uint _newIndex = treeIndex + 1;
            delete sortitionSumTrees[_key].treeIndexesToAddresses[_parentIndex];
            sortitionSumTrees[_key].addressesToTreeIndexes[_parentAddress] = _newIndex;
            sortitionSumTrees[_key].treeIndexesToAddresses[_newIndex] = _parentAddress;
        }
    }

    /**
     *  @dev Remove a value from a tree.
     *  @param _key The key of the tree to remove from.
     *  @param _treeIndex The index of the value to remove.
     *  @param _address The candidate's address.
     */
    function remove(bytes32 _key, uint _treeIndex, address _address) internal {
        require(sortitionSumTrees[_key].treeIndexesToAddresses[_treeIndex] == _address, "Address does not own this value.");
        super.remove(_key, _treeIndex);
        delete sortitionSumTrees[_key].addressesToTreeIndexes[sortitionSumTrees[_key].treeIndexesToAddresses[_treeIndex]];
        delete sortitionSumTrees[_key].treeIndexesToAddresses[_treeIndex];
    }

    /**
     *  @dev Set a value of a tree.
     *  @param _key The key of the tree.
     *  @param _treeIndex The index of the value.
     *  @param _value The new value.
     *  @param _address The candidate's address.
     */
    function set(bytes32 _key, uint _treeIndex, uint _value, address _address) internal {
        if (_value == 0) remove(_key, _treeIndex, _address);
        else {
            require(sortitionSumTrees[_key].treeIndexesToAddresses[_treeIndex] == _address, "Address does not own this value.");
            super.set(_key, _treeIndex, _value);
        }
    }

    /* Internal Views */

    /**
     *  @dev Draw an address from a tree using a number.
     *  @param _key The key of the tree.
     *  @param _drawnNumber The drawn number.
     *  @return The drawn address.
     */
    function draw(bytes32 _key, uint _drawnNumber) internal view returns(address _address) {
        KArySumTree storage tree = kArySumTrees[_key];
        uint _treeIndex = 0;
        uint _currentDrawnNumber = _drawnNumber % tree.tree[0];

        while ((tree.K * _treeIndex) + 1 < tree.tree.length)  // While it still has children.
            for (uint i = 1; i <= tree.K; i++) { // Loop over children.
                uint _nodeIndex = (tree.K * _treeIndex) + i;
                uint _nodeValue = tree.tree[_nodeIndex];

                if (_currentDrawnNumber >= _nodeValue) _currentDrawnNumber -= _nodeValue; // Go to the next child.
                else { // Pick this child.
                    _treeIndex = _nodeIndex;
                    break;
                }
            }
        
        _address = sortitionSumTrees[_key].treeIndexesToAddresses[_treeIndex];
    }

    /** @dev Gets a specified candidate's associated value.
     *  @param _key The key of the tree.
     *  @param _address The candidate's address.
     */
    function stakeOf(bytes32 _key, address _address) internal view returns(uint value) {
        KArySumTree storage tree = kArySumTrees[_key];
        uint _treeIndex = sortitionSumTrees[_key].addressesToTreeIndexes[_address];
        if (_treeIndex == 0) value = 0;
        else value = tree.tree[_treeIndex];
    }
}
