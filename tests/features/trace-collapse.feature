Feature: Trace collapse and reset buttons
  As a user exploring the crafting graph
  I want a "trace back" button to step the trace one level narrower
  Plus a "reset trace" button to clear all trace highlights
  So that I can walk the trace back without pressing Esc

  Background:
    Given the Crafting Atlas is loaded
    And item "Iron Sword" is open in the panel

  Scenario: Trace inputs grows the frontier
    When I trace inputs from the panel
    Then the trace has at least 1 node after 0ms

  Scenario: Trace out grows the frontier further
    When I trace inputs from the panel
    And I trace outputs from the panel
    Then the trace has at least 1 more node than the previous trace

  Scenario: Trace back shrinks the frontier by one level
    When I trace inputs from the panel
    And I trace outputs from the panel
    And I remember the trace node count
    And I trace back one level
    Then the trace has fewer nodes than the remembered count

  Scenario: Trace back to depth zero clears the trace
    When I trace inputs from the panel
    And I trace back one level
    Then the trace has 0 nodes

  Scenario: Reset trace removes all highlights
    When I trace inputs from the panel
    And I reset the trace
    Then the trace has 0 nodes
