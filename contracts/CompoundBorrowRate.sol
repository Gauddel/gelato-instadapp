pragma solidity ^0.6.10;

import { SafeMath } from "@gelatonetwork/core/contracts/external/SafeMath.sol";
import "./CTokenInterface.sol";

contract CompoundBorrowRate {
    using SafeMath for uint;

    CTokenInterface cToken;

    constructor() public {
        cToken = CTokenInterface(0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643);
    }

    function getCDAIAPRInRay() external view returns (uint256) {
        return cToken.borrowRatePerBlock().mul(2102400).mul(1e9); // Get ray version of the annual rate.
    }
}