export type PIICategory =
  | 'email'
  | 'phone'
  | 'address'
  | 'id_number'
  | 'bank_card';

export interface PIIMaskResult {
  masked_text: string;
  detected_categories: PIICategory[];
  replacement_map_ref: string | null;
}

export interface PIIReplacement {
  placeholder: string;
  category: PIICategory;
  original_value: string;
}

export interface PIIMaskOperation {
  result: PIIMaskResult;
  replacements: PIIReplacement[];
}
