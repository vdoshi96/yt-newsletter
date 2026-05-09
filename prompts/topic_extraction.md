Extract topics from the provided transcript or derived notes.

Return JSON only:
{
  "topics": [
    {
      "normalized_name": "lowercase-hyphen-name",
      "display_name": "Human readable name",
      "description": "Plain-English description",
      "importance_score": 0.0,
      "explanation": "Why this topic matters in this video"
    }
  ],
  "edges": [
    {
      "from_topic": "normalized_name",
      "to_topic": "normalized_name",
      "relation_type": "depends_on | contrasts_with | extends | example_of",
      "explanation": "Transcript-backed relationship"
    }
  ]
}

Do not invent topics that are not supported by the source. Mark uncertainty in the explanation if the source is partial.
