pragma solidity ^0.4.24;

/**
 *  @title SortitionSumTreeFactory
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A factory of trees that keep track of staked values for sortition.
 */
library SortitionSumTreeFactory {
    /* Structs */

    struct SortitionSumTree {
        uint K;
        uint[] stack;
        uint[] nodes;
        // Two-way mapping of IDs to node indexes. Note that node index 0 is reserved for the root node, and means the ID does not have a node.
        mapping(bytes32 => uint) IDsToTreeIndexes;
        mapping(uint => bytes32) nodeIndexesToIDs;
    }

    /* Storage */

    struct SortitionSumTrees {
        mapping(bytes32 => SortitionSumTree) sortitionSumTrees;
    }

    /* Public */

    /**
     *  @dev Create a sortition sum tree at the specified key.
     *  @param _key The key of the new tree.
     *  @param _K The number of children each node in the tree should have.
     */
    function createTree(SortitionSumTrees storage self, bytes32 _key, uint _K) public {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];
        require(tree.K == 0, "Tree already exists.");
        require(_K > 1, "K must be greater than one.");
        tree.K = _K;
        tree.stack.length = 0;
        tree.nodes.length = 0;
        tree.nodes.push(0);
    }

    /**
     *  @dev Delete a sortition sum tree at the specified key.
     *  @param _key The key of the tree to delete.
     */
    function deleteTree(SortitionSumTrees storage self, bytes32 _key) public {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];
        tree.K = 0;
        tree.stack.length = 0;
        tree.nodes.length = 0;
        delete self.sortitionSumTrees[_key];
    }

    /**
     *  @dev Append a value to a tree.
     *  @param _key The key of the tree to append to.
     *  @param _value The value to append.
     *  @param _ID The ID of the value.
     *  @return The index of the appended value in the tree.
     */
    function append(SortitionSumTrees storage self, bytes32 _key, uint _value, bytes32 _ID) public returns(uint treeIndex) {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];
        require(tree.IDsToTreeIndexes[_ID] == 0, "ID already has a value in this tree.");
        
        // Add node.
        if (tree.stack.length == 0) { // No vacant spots.
            // Get the index and append the value.
            treeIndex = tree.nodes.length;
            tree.nodes.push(_value);

            // Potentially append a new node and make the parent a sum node.
            if (treeIndex != 1 && (treeIndex - 1) % tree.K == 0) { // Is first child.
                uint parentIndex = treeIndex / tree.K;
                bytes32 parentID = tree.nodeIndexesToIDs[parentIndex];
                uint newIndex = treeIndex + 1;
                tree.nodes.push(tree.nodes[parentIndex]);
                delete tree.nodeIndexesToIDs[parentIndex];
                tree.IDsToTreeIndexes[parentID] = newIndex;
                tree.nodeIndexesToIDs[newIndex] = parentID;
            }
        } else { // Some vacant spot.
            // Pop the stack and append the value.
            treeIndex = tree.stack[tree.stack.length - 1];
            tree.stack.length--;
            tree.nodes[treeIndex] = _value;
        }

        // Add label.
        tree.IDsToTreeIndexes[_ID] = treeIndex;
        tree.nodeIndexesToIDs[treeIndex] = _ID;

        updateParents(self, _key, treeIndex, true, _value);
    }

    /**
     *  @dev Remove a value from a tree.
     *  @param _key The key of the tree to remove from.
     *  @param _ID The ID of the value.
     */
    function remove(SortitionSumTrees storage self, bytes32 _key, bytes32 _ID) public {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];
        uint treeIndex = tree.IDsToTreeIndexes[_ID];
        require(treeIndex != 0, "ID does not have a value in this tree.");

        // Remember value and set to 0.
        uint value = tree.nodes[treeIndex];
        tree.nodes[treeIndex] = 0;

        // Push to stack.
        tree.stack.push(treeIndex);

        // Clear label.
        delete tree.IDsToTreeIndexes[tree.nodeIndexesToIDs[treeIndex]];
        delete tree.nodeIndexesToIDs[treeIndex];

        updateParents(self, _key, treeIndex, false, value);
    }

    /**
     *  @dev Set a value of a tree.
     *  @param _key The key of the tree.
     *  @param _value The new value.
     *  @param _ID The ID of the value.
     */
    function set(SortitionSumTrees storage self, bytes32 _key, uint _value, bytes32 _ID) public {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];
        uint treeIndex = tree.IDsToTreeIndexes[_ID];
        require(treeIndex != 0, "ID does not have a value in this tree.");

        bool plusOrMinus = tree.nodes[treeIndex] <= _value;
        uint plusOrMinusValue = plusOrMinus ? _value - tree.nodes[treeIndex] : tree.nodes[treeIndex] - _value;
        tree.nodes[treeIndex] = _value;

        updateParents(self, _key, treeIndex, plusOrMinus, plusOrMinusValue);
    }

    /* Public Views */

    /**
     *  @dev Query the leafs of a tree.
     *  @param _key The key of the tree to get the leafs from.
     *  @param _cursor The pagination cursor.
     *  @param _count The number of items to return.
     *  @return The index at which leafs start, the values of the returned leafs, and wether there are more for pagination.
     *  Complexity: This function is O(n) where `n` is the max number of elements ever appended.
     */
    function queryLeafs(SortitionSumTrees storage self, bytes32 _key, uint _cursor, uint _count) public view returns(uint startIndex, uint[] values, bool hasMore) {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];

        // Find the start index.
        for (uint i = 0; i < tree.nodes.length; i++) {
            if ((tree.K * i) + 1 >= tree.nodes.length) {
                startIndex = i;
                break;
            }
        }

        // Get the values.
        uint loopStartIndex = startIndex + _cursor;
        values = new uint[](loopStartIndex + _count > tree.nodes.length ? tree.nodes.length - loopStartIndex : _count);
        uint valuesIndex = 0;
        for (uint j = loopStartIndex; j < tree.nodes.length; j++) {
            if (valuesIndex < _count) {
                values[valuesIndex] = tree.nodes[j];
                valuesIndex++;
            } else {
                hasMore = true;
                break;
            }
        }
    }

    /**
     *  @dev Draw an ID from a tree using a number. Note that this function reverts if the sum of all values in the tree is 0.
     *  @param _key The key of the tree.
     *  @param _drawnNumber The drawn number.
     *  @return The drawn ID.
     *  Complexity: This function is O(n) where `n` is the max number of elements ever appended.
     */
    function draw(SortitionSumTrees storage self, bytes32 _key, uint _drawnNumber) public view returns(bytes32 ID) {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];
        uint treeIndex = 0;
        uint currentDrawnNumber = _drawnNumber % tree.nodes[0];

        while ((tree.K * treeIndex) + 1 < tree.nodes.length)  // While it still has children.
            for (uint i = 1; i <= tree.K; i++) { // Loop over children.
                uint nodeIndex = (tree.K * treeIndex) + i;
                uint nodeValue = tree.nodes[nodeIndex];

                if (currentDrawnNumber >= nodeValue) currentDrawnNumber -= nodeValue; // Go to the next child.
                else { // Pick this child.
                    treeIndex = nodeIndex;
                    break;
                }
            }
        
        ID = tree.nodeIndexesToIDs[treeIndex];
    }

    /** @dev Gets a specified ID's associated value.
     *  @param _key The key of the tree.
     *  @param _ID The ID of the value.
     *  @return The associated value.
     */
    function stakeOf(SortitionSumTrees storage self, bytes32 _key, bytes32 _ID) public view returns(uint value) {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];
        uint treeIndex = tree.IDsToTreeIndexes[_ID];

        if (treeIndex == 0) value = 0;
        else value = tree.nodes[treeIndex];
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
    function updateParents(SortitionSumTrees storage self, bytes32 _key, uint _treeIndex, bool _plusOrMinus, uint _value) private {
        SortitionSumTree storage tree = self.sortitionSumTrees[_key];

        uint parentIndex = _treeIndex;
        while (parentIndex != 0) {
            parentIndex = (parentIndex - 1) / tree.K;
            tree.nodes[parentIndex] = _plusOrMinus ? tree.nodes[parentIndex] + _value : tree.nodes[parentIndex] - _value;
        }
    }
}
