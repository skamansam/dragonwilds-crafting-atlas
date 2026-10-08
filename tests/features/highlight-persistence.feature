Feature: Highlight state persistence
  As a user
  I want the highlight expansion state to survive a page reload
  So that I don't lose my place when I refresh the page

  Background:
    Given the Crafting Atlas is loaded
    And item "Iron Sword" is open in the panel

  Scenario: Highlight state round-trips through serialization
    When I show requires from the panel
    And I show enables from the panel
    And I serialize the highlight state
    Then the deserialized highlight has the same root
    And the deserialized highlight has the same depth

  Scenario: Cleared highlight serializes to null
    When I show requires from the panel
    And I reset the highlight
    And I serialize the highlight state
    Then the serialized highlight is null

  Scenario: Stale highlight IDs are rejected
    Given a highlight state with root "Iron Sword"
    And the highlight has stale node IDs
    When I serialize the highlight state
    Then the serialized highlight is null
