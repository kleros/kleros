/* globals artifacts, contract, expect, web3 */
const { expectThrow } = require('kleros-interaction/helpers/utils')

const ExposedSortitionSumTreeFactory = artifacts.require(
  './data-structures/ExposedSortitionSumTreeFactory.sol'
)

contract('SortitionSumTreeFactory', () =>
  it('Should successfully keep track of address ownership of values and draw them from the tree appropriately.', async () => {
    // Deploy contract
    const sortitionSumTreeFactory = await ExposedSortitionSumTreeFactory.new()

    // Create tree and populate with 4 candidates
    const tree = { key: '0x01', K: 2 }
    const candidates = {
      bob: {
        address: '0x0000000000000000000000000000000000000002',
        treeIndex: 0,
        value: 15
      },
      dave: {
        address: '0x0000000000000000000000000000000000000004',
        treeIndex: 0,
        value: 5
      },
      alice: {
        address: '0x0000000000000000000000000000000000000001',
        treeIndex: 0,
        value: 10
      },
      carl: {
        address: '0x0000000000000000000000000000000000000003',
        treeIndex: 0,
        value: 20
      }
    }
    await sortitionSumTreeFactory._createTree(tree.key, tree.K)
    for (const candidate of Object.values(candidates)) {
      candidate.treeIndex = await sortitionSumTreeFactory._append.call(
        tree.key,
        candidate.value,
        candidate.address
      )
      await sortitionSumTreeFactory._append(
        tree.key,
        candidate.value,
        candidate.address
      )
    }

    // Test drawing Bob with 13 and Carl with 27
    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.equal(
      candidates.bob.address
    )
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.equal(
      candidates.carl.address
    )

    // Set Alice to 14 to draw her with 13 and then set her back to 10 to draw Bob again
    await expectThrow(
      sortitionSumTreeFactory._set(
        tree.key,
        candidates.alice.treeIndex,
        14,
        candidates.bob.address // Only the owner should be able to set the value
      )
    )
    await sortitionSumTreeFactory._set(
      tree.key,
      candidates.alice.treeIndex,
      14,
      candidates.alice.address
    )
    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.equal(
      candidates.alice.address
    )
    await sortitionSumTreeFactory._set(
      tree.key,
      candidates.alice.treeIndex,
      10,
      candidates.alice.address
    )
    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.equal(
      candidates.bob.address
    )

    // Remove Carl to draw Dave with 27 and add him back in to draw him again
    await expectThrow(
      sortitionSumTreeFactory._remove(
        tree.key,
        candidates.carl.treeIndex,
        candidates.dave.address // Only the owner should be able to remove the value
      )
    )
    await sortitionSumTreeFactory._remove(
      tree.key,
      candidates.carl.treeIndex,
      candidates.carl.address
    )
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.equal(
      candidates.dave.address
    )
    candidates.carl.treeIndex = await sortitionSumTreeFactory._append.call(
      tree.key,
      candidates.carl.value,
      candidates.carl.address
    )
    await sortitionSumTreeFactory._append(
      tree.key,
      candidates.carl.value,
      candidates.carl.address
    )
    // Setting to 0 should also remove him
    await sortitionSumTreeFactory._set(
      tree.key,
      candidates.carl.treeIndex,
      0,
      candidates.carl.address
    )
    // Should not be able to append 0
    await expectThrow(
      sortitionSumTreeFactory._append(tree.key, 0, candidates.carl.address)
    )
    candidates.carl.treeIndex = await sortitionSumTreeFactory._append.call(
      tree.key,
      candidates.carl.value,
      candidates.carl.address
    )
    await sortitionSumTreeFactory._append(
      tree.key,
      candidates.carl.value,
      candidates.carl.address
    )
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.equal(
      candidates.carl.address
    )

    // Test stake view
    for (const candidate of Object.values(candidates))
      expect(
        await sortitionSumTreeFactory._stakeOf(tree.key, candidate.address)
      ).to.deep.equal(web3.toBigNumber(candidate.value))

    // Delete the tree
    await sortitionSumTreeFactory._deleteTree(tree.key)
  })
)
