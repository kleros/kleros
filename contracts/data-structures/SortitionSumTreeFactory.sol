pragma solidity ^0.4.24;

/**
 *  @title SortitionSumTreeFactory
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A factory of trees that keep track of staked values for sortition.
 */
contract SortitionSumTreeFactory {
    /* Structs */

    struct SortitionSumTree {
        uint K;
        uint[] stack;
        uint[] tree;
        mapping(address => uint) addressesToTreeIndexes;
        mapping(uint => address) treeIndexesToAddresses;
    }

    /* Storage */

    mapping(bytes32 => SortitionSumTree) internal sortitionSumTrees;

    /* Internal */

    /**
     *  @dev Create a sortition sum tree at the specified key.
     *  @param _key The key of the new tree.
     *  @param _K The number of children each node in the tree should have.
     */
    function createTree(bytes32 _key, uint _K) internal {
        SortitionSumTree storage tree = sortitionSumTrees[_key];
        require(tree.K == 0, "Tree already exists.");
        require(_K > 1, "K must be greater than one.");
        tree.K = _K;
        tree.stack.length = 0;
        tree.tree.length = 0;
        tree.tree.push(0);
    }

    /**
     *  @dev Delete a sortition sum tree at the specified key.
     *  @param _key The key of the tree to delete.
     */
    function deleteTree(bytes32 _key) internal {
        SortitionSumTree storage tree = sortitionSumTrees[_key];
        tree.K = 0;
        tree.stack.length = 0;
        tree.tree.length = 0;
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
        SortitionSumTree storage tree = sortitionSumTrees[_key];
        require(tree.addressesToTreeIndexes[_address] == 0, "Address already has a value in this tree.");
        
        // Add node.
        if (tree.stack.length == 0) { // No vacant spots.
            // Get the index and append the value.
            treeIndex = tree.tree.length;
            tree.tree.push(_value);

            // Potentially append a new node and make the parent a sum node.
            if (treeIndex != 1 && (treeIndex - 1) % tree.K == 0) { // Is first child.
                tree.tree.push(tree.tree[treeIndex / tree.K]);
                uint _parentIndex = treeIndex / tree.K;
                address _parentAddress = tree.treeIndexesToAddresses[_parentIndex];
                uint _newIndex = treeIndex + 1;
                delete tree.treeIndexesToAddresses[_parentIndex];
                tree.addressesToTreeIndexes[_parentAddress] = _newIndex;
                tree.treeIndexesToAddresses[_newIndex] = _parentAddress;
            }
        } else { // Some vacant spot.
            // Pop the stack and append the value.
            treeIndex = tree.stack[tree.stack.length - 1];
            tree.stack.length--;
            tree.tree[treeIndex] = _value;
        }

        // Add label.
        tree.addressesToTreeIndexes[_address] = treeIndex;
        tree.treeIndexesToAddresses[treeIndex] = _address;

        updateParents(_key, treeIndex, true, _value);
    }

    /**
     *  @dev Remove a value from a tree.
     *  @param _key The key of the tree to remove from.
     *  @param _treeIndex The index of the value to remove.
     *  @param _address The candidate's address.
     */
    function remove(bytes32 _key, uint _treeIndex, address _address) internal {
        SortitionSumTree storage tree = sortitionSumTrees[_key];
        require(tree.treeIndexesToAddresses[_treeIndex] == _address, "Address does not own this value.");
        require(_treeIndex != 0, "Cannot remove the root node.");

        // Remember value and set to 0.
        uint _value = tree.tree[_treeIndex];
        tree.tree[_treeIndex] = 0;

        // Push to stack.
        tree.stack.push(_treeIndex);

        // Clear label.
        delete tree.addressesToTreeIndexes[tree.treeIndexesToAddresses[_treeIndex]];
        delete tree.treeIndexesToAddresses[_treeIndex];

        updateParents(_key, _treeIndex, false, _value);
    }

    /**
     *  @dev Set a value of a tree.
     *  @param _key The key of the tree.
     *  @param _treeIndex The index of the value.
     *  @param _value The new value.
     *  @param _address The candidate's address.
     */
    function set(bytes32 _key, uint _treeIndex, uint _value, address _address) internal {
        SortitionSumTree storage tree = sortitionSumTrees[_key];
        require(tree.treeIndexesToAddresses[_treeIndex] == _address, "Address does not own this value.");
        require(_treeIndex != 0, "Cannot set the root node.");

        bool _plusOrMinus = tree.tree[_treeIndex] <= _value;
        uint _plusOrMinusValue = _plusOrMinus ? _value - tree.tree[_treeIndex] : tree.tree[_treeIndex] - _value;
        tree.tree[_treeIndex] = _value;

        updateParents(_key, _treeIndex, _plusOrMinus, _plusOrMinusValue);
    }

    /* Internal Views */

    /**
     *  @dev Query the leafs of a tree.
     *  @param _key The key of the tree to get the leafs from.
     *  @param _cursor The pagination cursor.
     *  @param _count The number of items to return.
     *  @return The index at which leafs start, the values of the returned leafs, and wether there are more for pagination.
     *  Complexity: This function is O(n) where `n` is the max number of elements ever appended.
     */
    function queryLeafs(bytes32 _key, uint _cursor, uint _count) internal view returns(uint startIndex, uint[] values, bool hasMore) {
        SortitionSumTree storage tree = sortitionSumTrees[_key];

        // Find the start index.
        for (uint i = 0; i < tree.tree.length; i++) {
            if ((tree.K * i) + 1 >= tree.tree.length) {
                startIndex = i;
                break;
            }
        }

        // Get the values.
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

    /**
     *  @dev Draw an address from a tree using a number.
     *  @param _key The key of the tree.
     *  @param _drawnNumber The drawn number.
     *  @return The drawn address.
     *  Complexity: This function is O(n) where `n` is the max number of elements ever appended.
     */
    function draw(bytes32 _key, uint _drawnNumber) internal view returns(address _address) {
        SortitionSumTree storage tree = sortitionSumTrees[_key];
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
        
        _address = tree.treeIndexesToAddresses[_treeIndex];
    }

    /** @dev Gets a specified candidate's associated value.
     *  @param _key The key of the tree.
     *  @param _address The candidate's address.
     */
    function stakeOf(bytes32 _key, address _address) internal view returns(uint value) {
        SortitionSumTree storage tree = sortitionSumTrees[_key];
        uint _treeIndex = tree.addressesToTreeIndexes[_address];

        if (_treeIndex == 0) value = 0;
        else value = tree.tree[_treeIndex];
    }

    /* Private */

    /**
     *  @dev Update all the parents of a node.
     *  @param _key The key of the tree to update.
     *  @param _treeIndex The index of the node to start from.
     *  @param _plusOrMinus Wether to add (true) or substract (false).
     *  @param _value The value to add or substract.
     *  Complexity: This function is O(log(k)(n)) where `n` is the max number of elements ever appended.
     */
    function updateParents(bytes32 _key, uint _treeIndex, bool _plusOrMinus, uint _value) private {
        SortitionSumTree storage tree = sortitionSumTrees[_key];

        uint parentIndex = _treeIndex;
        while (parentIndex != 0) {
            parentIndex = (parentIndex - 1) / tree.K;
            tree.tree[parentIndex] = _plusOrMinus ? tree.tree[parentIndex] + _value : tree.tree[parentIndex] - _value;
        }
    }
}
