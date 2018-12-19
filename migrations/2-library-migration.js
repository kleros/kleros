/* global artifacts */
const SortitionSumTreeFactory = artifacts.require(
  './data-structures/SortitionSumTreeFactory.sol'
)
const ExposedSortitionSumTreeFactory = artifacts.require(
  './data-structures/ExposedSortitionSumTreeFactory.sol'
)
const KlerosLiquid = artifacts.require('./kleros/KlerosLiquid.sol')

module.exports = function(deployer) {
  deployer.deploy(SortitionSumTreeFactory)
  deployer.link(SortitionSumTreeFactory, [
    ExposedSortitionSumTreeFactory,
    KlerosLiquid
  ])
}
