Feature: Describing exported data edits as a pull request
  scripts/open-edits-pr.mjs merges an exported dragonwilds-edits.json into the
  dataset and opens a pull request. The merge itself is apply-edits-core.mjs
  (covered by edits-apply.feature); these scenarios pin down what the script
  says about the change — the branch name, the commit and the PR body.

  Background: a dataset with an Iron Bar node
    Given a dataset with an "Iron Bar" node of kind "material" and item type "Processed Material"

  Scenario: A changed field is named in the commit and the PR body
    Given an edits overlay changing "Iron Bar" itemType to "Bar"
    When the overlay is summarised
    Then the change is reported as "`Iron Bar`: itemType `Processed Material` → `Bar`"
    And the default title names "Iron Bar"
    And the PR body lists the change under "What changed"

  Scenario: The branch name follows an explicit title
    Given an edits overlay changing "Iron Bar" itemType to "Bar"
    When the overlay is summarised
    And the branch is named from the title "Fix Iron Bar's item type"
    Then the branch is "data/fix-iron-bar-s-item-type"

  Scenario: A link makes it a graph change
    Given an edits overlay adding a "gives" link from "Iron Bar" to "Ash Logs"
    When the overlay is summarised
    Then the graph is reported as changed
    And the default title names "Iron Bar gives Ash Logs"

  Scenario: Field-only edits leave the exports alone
    Given an edits overlay changing "Iron Bar" itemType to "Bar"
    When the overlay is summarised
    Then the graph is not reported as changed

  Scenario: An edit the dataset has already caught up with is not described
    Given an edits overlay changing "Iron Bar" itemType to "Processed Material"
    When the overlay is summarised
    Then the summary is empty

  Scenario: A full dataset export is diffed against the dataset it replaces
    Given a full dataset export of one node "Iron Bar" and one node "New Ore"
    And the dataset also has a node "Old Ore"
    When the export is summarised against the dataset
    Then the summary reports "New Ore" as added
    And the summary reports "Old Ore" as removed
