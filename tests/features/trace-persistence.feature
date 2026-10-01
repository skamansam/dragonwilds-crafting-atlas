Feature: Trace state persistence
  As a user
  I want the trace expansion state to survive a page reload
  So that I don't lose my place when I refresh the page

  Background:
    Given the Crafting Atlas is loaded
    And item "Iron Sword" is open in the panel

  Scenario: Trace state round-trips through serialization
    When I trace inputs from the panel
    And I trace outputs from the panel
    And I serialize the trace state
    Then the deserialized trace has the same root
    And the deserialized trace has the same depth

  Scenario: Cleared trace serializes to null
    When I trace inputs from the panel
    And I reset the trace
    And I serialize the trace state
    Then the serialized trace is null

  Scenario: Stale trace IDs are rejected
    Given a trace state with root "Iron Sword"
    And the trace has stale node IDs
    When I serialize the trace state
    Then the serialized trace is null
