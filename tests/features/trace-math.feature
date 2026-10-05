Feature: Trace math (frontier, expansion, collapse, serialization)
  As a developer maintaining the progressive trace engine
  I want the pure trace math covered by Gherkin scenarios
  So that the browser-free logic is verified without a separate unit-test file

  Background:
    Given the Crafting Atlas is loaded

  # frontier collection (site/app.js traceStep → collectFrontier)
  Scenario: Upstream frontier collects a recipe's ingredients
    Given a trace anchored on "Iron Bar"
    When I collect the upstream frontier
    Then the frontier includes node "Iron Ore"
    And the frontier includes no nodes of kind "skill"

  Scenario: Downstream frontier collects the products
    Given a trace anchored on "Bread"
    When I collect the downstream frontier
    Then the frontier is not empty

  # progressive expansion (one level per click)
  Scenario: Upstream expansion grows one level per click
    Given a trace anchored on "Bread"
    When I trace inputs for 2 levels
    Then the trace depth is 2
    And the trace contains at least 3 nodes

  Scenario: Downstream expansion reports exhaustion
    Given a trace anchored on "Bread"
    When I trace outputs for 2 levels
    Then the trace exhausted at level 1

  Scenario: Upstream expansion never walks skill-gate spokes
    Given a trace anchored on "Iron Bar"
    When I trace inputs for 2 levels
    Then the trace has no nodes of kind "skill"

  # facility awareness (TODO #23) — upstream only, resolved stations/tools only
  Scenario: Facility-aware upstream expansion
    Given a trace anchored on "Draconic Staff"
    When I trace inputs for 2 levels
    Then the trace includes node "Mystic Forge"
    And the trace additionally includes node "Bronze Bar"
    And the trace further includes node "Ash Logs"

  Scenario: Unresolved facilities are never added as nodes
    Given a trace anchored on "Draconic Staff"
    When I trace inputs for 1 level
    Then the trace does not include node "Build Menu"

  # collapse (traceBack → clearTrace handoff, matching app.js)
  Scenario: Trace back removes exactly the deepest frontier
    Given a trace anchored on "Iron Sword"
    And I trace inputs for 3 levels
    And I record the deepest frontier
    When I trace back one level
    Then the removed nodes are exactly the recorded frontier
    And the trace depth is 2

  Scenario: Trace back keeps the anchor while levels remain
    Given a trace anchored on "Bread"
    And I trace inputs for 2 levels
    When I trace back one level
    Then the trace includes node "Bread"
    And the trace depth is 1

  Scenario: Backing past the last level clears the trace
    Given a trace anchored on "Iron Sword"
    And I trace inputs for 1 level
    When I trace back one level
    Then the trace has 0 nodes

  # persistence primitives (dw.trace serialization)
  Scenario: Serialized trace is JSON-safe
    Given a trace anchored on "Bread"
    And I trace inputs for 1 level
    When I serialize the trace
    Then the serialized levels are a JSON array

  Scenario: Deserialization restores every level
    Given a trace anchored on "Bread"
    And I trace inputs for 2 levels
    When I serialize the trace
    Then the deserialized trace restores the original levels
    And the deserialized trace restores the original depth

  Scenario: Deserialization rejects malformed state
    When I deserialize the trace string "not json"
    Then the deserialized trace is null
