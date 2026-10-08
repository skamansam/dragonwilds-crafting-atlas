Feature: Applying exported data edits
  As a maintainer
  I want browser-exported corrections baked into the dataset
  So that an edit made in the app can ship with the atlas

  Background:
    Given a dataset with an "Iron Bar" node and an "Ash Logs" node

  Scenario: An edited field is merged onto the dataset
    Given an edits overlay changing "Iron Bar" kind to "material"
    When the edits overlay is merged
    Then node "Iron Bar" has kind "material"
    And the merge reports 1 changed nodes

  Scenario: Unchanged values change nothing
    Given an edits overlay repeating the current values
    When the edits overlay is merged
    Then the merge reports 0 changed nodes

  Scenario: Unknown ids are skipped and reported
    Given an edits overlay changing "Ghost Item" name to "Boo"
    When the edits overlay is merged
    Then the merge reports "Ghost Item" as missed

  Scenario: A full dataset export replaces the graph
    Given a full dataset export with one node "Custom Ore"
    When the dataset export is validated and applied
    Then the dataset has a node "Custom Ore"
    And the dataset no longer has a node "Iron Bar"

  Scenario: A dataset export with duplicate ids is rejected
    Given a dataset export with a duplicate "Iron Bar" id
    When the dataset export is validated
    Then the validation fails
