// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {
    IEAS,
    MultiAttestationRequest,
    AttestationRequestData
} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title  VerifiableAttester
 * @notice The VerifiableAttester contract is used to make attestations to an EAS-compatible
 *         contract in a way that allows the list of attestations made to be easily verified
 *         offchain. Attestations can be made through this contract by an admin address until the
 *         contract is locked. Once the contract is locked, no further attestations can be made. A
 *         verification hash is maintained that is updated with each attestation made. Offchain
 *         actors can easily verify all of the attestations made through this contract by checking
 *         that the verification hash matches the expected hash for the attestations that should
 *         have been made. Requires that the list of attestations to be made has a fixed ordering.
 */
contract VerifiableAttester {
    /**
     * @notice Address of the EAS contract to make attestations to.
     */
    IEAS public immutable $EAS;

    /**
     * @notice Address of the admin of this contract.
     */
    address public $admin;

    /**
     * @notice Name of the collection of attestations in this contract.
     */
    string public $name;

    /**
     * @notice Description of the collection of attestations in this contract.
     */
    string public $description;

    /**
     * @notice Verification hash of the attestations made through this contract.
     */
    bytes32 public $vhash;

    /**
     * @notice Whether or not this contract is locked.
     */
    bool public $locked;

    /**
     * @notice Modifier that requires this contract to be uninitialized.
     */
    modifier uninitialized() {
        require(
            $admin == address(0),
            "VerifiableAttester: contract has already been initialized"
        );
        _;
    }

    /**
     * @notice Modifier that requires the caller to be the admin of this contract.
     */
    modifier authenticated() {
        require(
            msg.sender == $admin,
            "VerifiableAttester: only the contract admin can trigger this function"
        );
        _;
    }

    /**
     * @notice Modifier that requires this contract to be unlocked.
     */
    modifier unlocked() {
        require(
            $locked == false,
            "VerifiableAttester: contract is locked and this function cannot be called"
        );
        _;
    }

    /**
     * @param eas  Address of the EAS contract to make attestations to.
     * @param name Name of the collection of attestations in this contract.
     */
    constructor(
        IEAS eas,
        string memory name
    ) {
        $EAS = eas;
        $name = name;
    }

    /**
     * @notice Initializes the contract. Separated from the constructor so that the variables here
     *         do not impact the initcode of the contract and therefore do not impact the resulting
     *         contract address.
     *
     * @param admin       Address of the admin of this contract.
     * @param description Description of the collection of attestations in this contract.
     */
    function initialize(
        address admin,
        string memory description
    )
        public
        uninitialized
    {
        $admin = admin;
        $description = description;
    }

    /**
     * @notice Makes attestations to the EAS contract.
     *
     * @param requests List of MultiAttestationRequests to make attestations for.
     */
    function attest(
        MultiAttestationRequest[] memory requests
    )
        public
        authenticated
        unlocked
    {
        // Update the verification hash with the new attestations.
        for (uint256 i = 0; i < requests.length; i++) {
            MultiAttestationRequest memory request = requests[i];
            for (uint256 j = 0; j < request.data.length; j++) {
                $vhash = keccak256(abi.encode($vhash, request.schema, request.data[j]));
            }
        }

        // Submit the attestations.
        $EAS.multiAttest(requests);
    }

    /**
     * @notice Locks this contract.
     */
    function lock()
        public
        authenticated
    {
        $locked = true;
    }
}
