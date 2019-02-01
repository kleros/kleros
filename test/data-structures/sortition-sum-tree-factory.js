/* globals artifacts, contract, expect, web3 */
const ExposedSortitionSumTreeFactory = artifacts.require(
  './data-structures/ExposedSortitionSumTreeFactory.sol'
)

contract('SortitionSumTreeFactory', () =>
  it('Should successfully keep track of ID ownership of values and draw them from the tree appropriately.', async () => {
    // Deploy contract
    const sortitionSumTreeFactory = await ExposedSortitionSumTreeFactory.new()

    // Create tree and populate with 4 candidates
    const tree = { key: '0x01', K: 2 }
    const candidates = {
      bob: {
        ID:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
        treeIndex: 0,
        value: 15
      },
      dave: {
        ID:
          '0x0000000000000000000000000000000000000000000000000000000000000004',
        treeIndex: 0,
        value: 5
      },
      alice: {
        ID:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        treeIndex: 0,
        value: 10
      },
      carl: {
        ID:
          '0x0000000000000000000000000000000000000000000000000000000000000003',
        treeIndex: 0,
        value: 20
      }
    }
    await sortitionSumTreeFactory._createTree(tree.key, tree.K)
    for (const candidate of Object.values(candidates)) {
      candidate.treeIndex = await sortitionSumTreeFactory._set.call(
        tree.key,
        candidate.value,
        candidate.ID
      )
      await sortitionSumTreeFactory._set(
        tree.key,
        candidate.value,
        candidate.ID
      )
    }

    // Test drawing Bob with 13 and Carl with 27
    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.equal(
      candidates.bob.ID
    )
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.equal(
      candidates.carl.ID
    )

    // Set Alice to 14 to draw her with 13 and then set her back to 10 to draw Bob again
    await sortitionSumTreeFactory._set(tree.key, 14, candidates.alice.ID)
    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.equal(
      candidates.alice.ID
    )
    await sortitionSumTreeFactory._set(tree.key, 10, candidates.alice.ID)
    expect(await sortitionSumTreeFactory._draw(tree.key, 13)).to.equal(
      candidates.bob.ID
    )

    // Remove Carl to draw Dave with 27 and add him back in to draw him again
    await sortitionSumTreeFactory._set(tree.key, 0, candidates.carl.ID)
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.equal(
      candidates.dave.ID
    )
    candidates.carl.treeIndex = await sortitionSumTreeFactory._set.call(
      tree.key,
      candidates.carl.value,
      candidates.carl.ID
    )
    await sortitionSumTreeFactory._set(
      tree.key,
      candidates.carl.value,
      candidates.carl.ID
    )
    expect(await sortitionSumTreeFactory._draw(tree.key, 27)).to.equal(
      candidates.carl.ID
    )

    // Test stake view
    for (const candidate of Object.values(candidates))
      expect(
        await sortitionSumTreeFactory._stakeOf(tree.key, candidate.ID)
      ).to.deep.equal(web3.toBigNumber(candidate.value))

    // Delete the tree
    await sortitionSumTreeFactory._deleteTree(tree.key)
  })
)
