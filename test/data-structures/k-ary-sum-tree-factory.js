/* globals artifacts, contract, expect, web3 */
const ExposedKArySumTreeFactory = artifacts.require(
  './data-structures/ExposedKArySumTreeFactory.sol'
)

// Helpers
const generateValues = K =>
  [...new Array(Math.floor(K ** 2 + Math.random() * K))].map(_ =>
    Math.floor(Math.random() * 100)
  )
const checkTree = async (kArySumTreeFactory, key) => {
  // Fetch tree
  const [_K, stack, tree] = await kArySumTreeFactory._kArySumTrees(key)
  const K = _K.toNumber()

  // Check stack
  for (const index of stack)
    if (!tree[index.toNumber()].eq(0))
      throw new Error(`Tree with values [${tree}], has an invalid stack.`)

  // Loop over all nodes
  for (let i = 0; i < tree.length; i++) {
    // Get children
    const children = []
    for (let c = 1; c <= K; c++) {
      const childIndex = K * i + c
      if (tree[childIndex]) children.push(tree[childIndex])
    }

    // If not a leaf, verify sum
    if (
      children.length !== 0 &&
      !tree[i].eq(children.reduce((acc, n) => acc.plus(n), web3.toBigNumber(0)))
    )
      throw new Error(`Tree with values [${tree}], is in an invalid state.`)
  }
}

contract('KArySumTreeFactory', () =>
  it('Should create, delete, and succesfully modify multiple trees.', async () => {
    // Deploy contract
    const kArySumTreeFactory = await ExposedKArySumTreeFactory.new()

    // Create 3 different trees
    const trees = [
      {
        key: '0x01',
        K: 2,
        values: generateValues(2)
      },
      { key: '0x02', K: 3, values: [] },
      {
        key: '0x03',
        K: 5,
        values: generateValues(5)
      }
    ]
    for (const tree of trees)
      await kArySumTreeFactory._createKArySumTree(tree.key, tree.K)

    // Check for proper initialization of trees
    for (const tree of trees)
      expect(await kArySumTreeFactory._kArySumTrees(tree.key)).to.deep.equal([
        web3.toBigNumber(tree.K),
        [],
        []
      ])

    // Delete the middle tree
    await kArySumTreeFactory._deleteKArySumTree(trees[1].key)

    // Check that it was deleted properly and remove it from the test array
    expect(await kArySumTreeFactory._kArySumTrees(trees[1].key)).to.deep.equal([
      web3.toBigNumber(0),
      [],
      []
    ])
    trees.splice(1, 1)

    // Append values and check trees
    for (const tree of trees) {
      for (const value of tree.values)
        await kArySumTreeFactory._append(tree.key, value)
      await checkTree(kArySumTreeFactory, tree.key)
    }

    // Remove values and check trees
    for (const tree of trees) {
      const treeLength = (await kArySumTreeFactory._kArySumTrees(tree.key))[2]
        .length
      for (let i = tree.values.length - 1; i >= 0; i--)
        await kArySumTreeFactory._remove(tree.key, treeLength - 1 - i)
      await checkTree(kArySumTreeFactory, tree.key)
    }

    // Append values back in and check trees
    for (const tree of trees) {
      for (let i = tree.values.length - 1; i >= 0; i--)
        await kArySumTreeFactory._append(tree.key, tree.values[i])
      await checkTree(kArySumTreeFactory, tree.key)
    }

    // Test pagination query
    for (const tree of trees) {
      let startIndex = 0
      let values = []
      let _values = []
      let hasMore = true
      while (hasMore) {
        ;[startIndex, _values, hasMore] = await kArySumTreeFactory._queryLeafs(
          tree.key,
          values.length,
          2
        )
        values = [...values, ..._values]
      }

      // Check result
      expect(startIndex.toNumber()).to.equal(
        (await kArySumTreeFactory._kArySumTrees(tree.key))[2].length -
          tree.values.length
      )
      expect(values.map(v => v.toNumber())).to.deep.equal(tree.values)
      expect(hasMore).to.equal(false)
    }
  })
)
