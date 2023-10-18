import { ethers } from 'ethers'
import { MultiAttestationRequest, AttestationRequestData } from '@ethereum-attestation-service/eas-sdk'
import { EncodedAttestation } from '../interfaces/attestation'

/**
 * Packs an array of encoded attestations into a MultiAttestationRequest.
 * 
 * @param attestations Array of encoded attestations.
 * 
 * @returns Packed MultiAttestationRequest.
 */
export const pack = (
  attestations: EncodedAttestation[]
): MultiAttestationRequest[] => {
  return attestations
    .reduce((acc: any, attestation: EncodedAttestation) => {
      // Find the entry for the schema.
      let entry = acc.find((entry: any) => {
        return entry.schema === attestation.schema
      })

      // If none exists, create a new entry.
      if (!entry) {
        entry = { schema: attestation.schema, data: [] }
        acc.push(entry)
      }

      // Add the attestation to the entry.
      entry.data.push({
        recipient: attestation.recipient || ethers.constants.AddressZero,
        expirationTime: 0,
        revocable: false,
        refUID: ethers.constants.HashZero,
        data: attestation.data,
        value: 0
      })

      return acc
    }, [])
}

/**
 * Slices up an array of attestation requests into a set of smaller requests that fit inside the
 * block gas limit of the network.
 * 
 * @param attester VerifiableAttester contract.
 * @param requests Array of MultiAttestationRequests.
 * 
 * @returns Array of MultiAttestationRequests.
 */
export const slice = async (
  attester: ethers.Contract,
  requests: MultiAttestationRequest[],
): Promise<MultiAttestationRequest[]> => {
  const sliced: MultiAttestationRequest[] = []

  // Needs to be a VerifiableAttester contract.
  if (attester.estimateGas.attest === undefined) {
    throw new Error('attest method not found')
  }

  // Get the block gas limit.
  const block = await attester.provider.getBlock('latest')

  // Grab the contract admin.
  const admin = await attester.$admin()

  // Slice up each request into smaller requests.
  for (const request of requests) {
    let start = 0

    // Iterate until the entire request has been sliced.
    while (start < request.data.length) {
      let lo = start
      let hi = request.data.length
      let mid = undefined

      // Binary search for the largest slice that fits inside the block gas limit.
      while (lo <= hi) {
        mid = Math.floor((lo + hi) / 2)
        try {
          const estimate = await attester.estimateGas.attest(
            [
              {
                schema: request.schema,
                data: request.data.slice(start, mid)
              }
            ],
            {
              from: admin
            }
          )

          // Estimate must be less than block gas limit with 100k buffer.
          if (estimate.gt(block.gasLimit.sub(100000))) {
            hi = mid - 1
          } else {
            lo = mid + 1
          }
        } catch (err) {
          if (
            err.message.includes('exceeds gas limit') ||
            err.message.includes('cannot estimate gas')
          ) {
            hi = mid - 1
          } else {
            throw err
          }
        }
      }

      // Add the slice to the list of slices.
      sliced.push({
        schema: request.schema,
        data: request.data.slice(start, Math.max(start, lo - 1))
      })

      // Update the start index.
      start = lo
    }
  }

  return sliced
}

/**
 * Computes an updated verification hash.
 * 
 * @param vhash Previous verification hash.
 * @param schema Schema of the attestation.
 * @param attestation Attestation data.
 * 
 * @returns Updated verification hash.
 */
export const hash = (
  vhash: string,
  schema: string,
  attestation: AttestationRequestData
): string => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        'bytes32',
        'bytes32',
        'tuple(address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value)'
      ],
      [
        vhash,
        schema,
        attestation
      ]
    )
  )
}

/**
 * Verifies a verification hash against a set of attestation requests.
 * 
 * @param vhash Verification hash.
 * @param requests Array of MultiAttestationRequests.
 * 
 * @returns Boolean indicating whether the verification hash is valid.
 */
export const verify = (
  vhash: string,
  requests: MultiAttestationRequest[]
): boolean => {
  let computed = ethers.constants.HashZero
  for (const entry of requests) {
    for (const attestation of entry.data) {
      computed = hash(computed, entry.schema, attestation)
    }
  }
  
  // Check if computed matches given.
  return computed === vhash
}

/**
 * Slices an array of attestation requests by removing the prefix of requests that are already
 * reflected inside the verification hash.
 * 
 * @param vhash Verification hash.
 * @param requests Array of MultiAttestationRequests.
 * 
 * @returns Array of MultiAttestationRequests.
 */
export const rehash = (
  vhash: string,
  requests: MultiAttestationRequest[]
): MultiAttestationRequest[] => {
  const rehashed: MultiAttestationRequest[] = []
  let computed = ethers.constants.HashZero
  let found = false

  // Iterate over each request to find the prefix that matches the verification hash.
  for (const request of requests) {
    const updated: MultiAttestationRequest = { schema: request.schema, data: [] }

    // Iterate over each attestation to find the prefix that matches the verification hash.
    for (const data of request.data) {
      computed = hash(computed, request.schema, data)

      // If we found the prefix, add the rest of the attestations to the updated request.
      if (computed === vhash) {
        found = true
        continue
      }

      // Always true if the above check passes once.
      if (found) {
        updated.data.push(data)
      }
    }

    // Push only if we found the prefix and there are attestations to add.
    if (found && updated.data.length > 0) {
      rehashed.push(updated)
    }
  }

  // If we didn't find the prefix, return the original requests.
  if (!found) {
    if (vhash === ethers.constants.HashZero) {
      return requests
    } else {
      throw new Error('verification hash mismatch')
    }
  }

  return rehashed
}
