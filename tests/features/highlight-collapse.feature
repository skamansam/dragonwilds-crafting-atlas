Feature: Highlight collapse and reset buttons
  As a user exploring the crafting graph
  I want a "step back" button to shrink the highlight one level
  Plus a "reset" button to clear all highlights
  So that I can walk the highlight back without pressing Esc

  Background:
    Given the Crafting Atlas is loaded
    And item "Iron Sword" is open in the panel

  Scenario: Requires grows the frontier
    When I show requires from the panel
    Then the highlight has at least 1 node after 0ms

  Scenario: Enables grows the frontier further
    When I show requires from the panel
    And I show enables from the panel
    Then the highlight has at least 1 more node than the previous highlight

  Scenario: Step back shrinks the frontier by one level
    When I show requires from the panel
    And I show enables from the panel
    And I remember the highlight node count
    And I step back one level
    Then the highlight has fewer nodes than the remembered count

  Scenario: Step back to depth zero clears the highlight
    When I show requires from the panel
    And I step back one level
    Then the highlight has 0 nodes

  Scenario: Reset removes all highlights
    When I show requires from the panel
    And I reset the highlight
    Then the highlight has 0 nodes
