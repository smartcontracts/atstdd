import { getChainId } from '@eth-optimism/core-utils'
import { ethers } from 'ethers'

/**
 * Mapping of chain ids to contract addresses.
 */
interface ChainAddressMapping {
  [chainid: number]: string
}

/**
 * EAS contract addresses.
 */
export const EAS: ChainAddressMapping = {
  420: '0x4200000000000000000000000000000000000021'
}

/**
 * SchemaRegistry contract addresses.
 */
export const REGISTRY: ChainAddressMapping = {
  420: '0x4200000000000000000000000000000000000020'
}

/**
 * Resolves an address for a given chain id.
 * 
 * @param mapping  Mapping to resolve from.
 * @param provider Ethers provider to query chain id from.
 * @param supplied Address supplied by the user.
 * 
 * @returns Resolved address.
 */
export const resolve = async (
  mapping: ChainAddressMapping,
  provider: ethers.providers.Provider,
  supplied?: string
): Promise<string> => {
  if (supplied) {
    return supplied
  } else {
    const chainid = await getChainId(provider)
    const resolved = mapping[chainid]
    if (resolved === undefined) {
      throw new Error(`EAS contract not found for chain id ${chainid}, must supply manually`)
    }
    return resolved
  }
}
