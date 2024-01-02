const NUMBER_INPUT = "<number between 0 and 2048>";
const THE_VALUE_AT = "the value at";

const OPERATORS_TREE = {
  "skip if": [NUMBER_INPUT, REFERENCE_INDICATORS[0]]  
};

const LINK_TREE = {
  "skip if": EQUAL_LINKS[0]
}

const OPERAND_B_TREE = 
{
  "skip if": [NUMBER_INPUT, AT_ADDRESS_LINKS[0]]
};