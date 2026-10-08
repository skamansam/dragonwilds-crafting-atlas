Feature: Highlight math (frontier, expansion, collapse, serialization)
  As a developer maintaining the progressive highlight engine
  I want the pure highlight math covered by Gherkin scenarios
  So that the browser-free logic is verified without a separate unit-test file

  Background:
    Given the Crafting Atlas is loaded

  # frontier collection (site/app.js expandHighlight → collectFrontier)
  Scenario: Upstream frontier collects a recipe's ingredients
    Given a highlight anchored on "Iron Bar"
    When I collect the upstream frontier
    Then the frontier includes node "Iron Ore"
    And the frontier includes no nodes of kind "skill"

  Scenario: Downstream frontier collects the products
    Given a highlight anchored on "Bread"
    When I collect the downstream frontier
    Then the frontier is not empty

  # progressive expansion (one level per click)
  Scenario: Upstream expansion grows one level per click
    Given a highlight anchored on "Bread"
    When I expand requires for 2 levels
    Then the highlight depth is 2
    And the highlight contains at least 3 nodes

  Scenario: Downstream expansion reports exhaustion
    Given a highlight anchored on "Bread"
    When I expand enables for 2 levels
    Then the highlight exhausted at level 1

  Scenario: Upstream expansion never walks skill-gate spokes
    Given a highlight anchored on "Iron Bar"
    When I expand requires for 2 levels
    Then the highlight has no nodes of kind "skill"

  # facility awareness (TODO #23) — upstream only, resolved stations/tools only
  Scenario: Facility-aware upstream expansion
    Given a highlight anchored on "Draconic Staff"
    When I expand requires for 2 levels
    Then the highlight includes node "Mystic Forge"
    And the highlight additionally includes node "Bronze Bar"
    And the highlight further includes node "Ash Logs"

  Scenario: Unresolved facilities are never added as nodes
    Given a highlight anchored on "Draconic Staff"
    When I expand requires for 1 level
    Then the highlight does not include node "Build Menu"

  # collapse (stepBackHighlight → clearHighlight handoff, matching app.js)
  Scenario: Step back removes exactly the deepest frontier
    Given a highlight anchored on "Iron Sword"
    And I expand requires for 3 levels
    And I record the deepest frontier
    When I step back one level
    Then the removed nodes are exactly the recorded frontier
    And the highlight depth is 2

  Scenario: Step back keeps the anchor while levels remain
    Given a highlight anchored on "Bread"
    And I expand requires for 2 levels
    When I step back one level
    Then the highlight includes node "Bread"
    And the highlight depth is 1

  Scenario: Backing past the last level clears the highlight
    Given a highlight anchored on "Iron Sword"
    And I expand requires for 1 level
    When I step back one level
    Then the highlight has 0 nodes

  # persistence primitives (dw.highlight serialization)
  Scenario: Serialized highlight is JSON-safe
    Given a highlight anchored on "Bread"
    And I expand requires for 1 level
    When I serialize the highlight
    Then the serialized levels are a JSON array

  Scenario: Deserialization restores every level
    Given a highlight anchored on "Bread"
    And I expand requires for 2 levels
    When I serialize the highlight
    Then the deserialized highlight restores the original levels
    And the deserialized highlight restores the original depth

  Scenario: Deserialization rejects malformed state
    When I deserialize the highlight string "not json"
    Then the deserialized highlight is null
