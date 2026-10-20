Feature: Pointing an item at the live map
  The atlas knows WHICH region a gatherable comes from but not where inside it:
  data.json carries no coordinates for anything. The Wyrmwatch map on
  survivalservers.com does — its own reference file holds every marker position
  and the type keys it draws them under. scripts/build-map-links.mjs joins the
  atlas's node names to those keys, decides the view that frames each type, and
  writes public/map-links.js; src/map-links.js turns one node of that artifact
  into a link. Both halves are pure, so both are driven here — the generator
  only adds the cache and the network, and the panel button is covered by the
  `maplinks` checks in scripts/test-ui.mjs.

  The join is deliberately strict. A tolerant rule (substring, prefix) reads
  well until "Soul Stone" matches the map's `stone` type and aims a reader at
  3,377 boulders, so a name the rule cannot answer stays unlinked and the
  generator reports it instead.

  Background: the map's own little reference, and the atlas read against it
    Given a map drawing Iron, Stone, Ash Tree, Anima Vent, Death and Coal, and the atlas nodes gathered from them

  Scenario: A wiki title answers to the map's marker type
    When the atlas is joined to the map
    Then "Iron Ore Node" opens the marker types "iron"
    And "Ash Tree" opens the marker types "ash_tree"

  Scenario: One label covering several keys comes back whole
    When the atlas is joined to the map
    Then "Anima Vent" opens the marker types "anima_vent_air,anima_vent_fire"

  Scenario: A name the rule cannot answer is left unlinked rather than guessed
    When the atlas is joined to the map
    Then "Soul Stone" opens no marker type
    And "Stone Boulder" opens the marker types "stone"

  Scenario: A type the atlas does not gather from is never offered
    When the atlas is joined to the map
    Then "Death" opens no marker type

  Scenario: A type with no markers of its own is not in the catalogue
    Given the map draws the "rock" type "blurite" labelled "Blurite"
    And an atlas node "Blurite Ore Node" of kind "resource"
    When the atlas is joined to the map
    Then the catalogue holds no type "blurite"
    And "Blurite Ore Node" opens no marker type

  Scenario: A type that only exists underground opens the underground plane
    When the atlas is joined to the map
    Then "Coal Node" opens the underground plane
    And "Iron Ore Node" opens the surface plane

  Scenario: The view frames the markers of the node's own types
    When the atlas is joined to the map
    Then the view for "Ash Tree" is centred at "1005,1005"
    And the view for "Ash Tree" is tighter than the view for "Iron Ore Node"

  Scenario: The view stays inside the map it describes
    Given the "iron" type has one marker at "-900000,-900000"
    When the atlas is joined to the map
    Then the view for "Iron Ore Node" is inside the map's world

  Scenario: The artifact only names what it carries
    When the atlas is joined to the map
    Then every linked node filters on a type the artifact carries

  Scenario: The report accounts for the nodes a reader would ask about
    Given an atlas node "Kalphite Egg" of kind "resource"
    When the atlas is joined to the map
    Then the report reaches "5 of 6" resources
    And the report lists "Kalphite Egg" as having no counterpart

  Scenario: The link is a hash with a view, because a filter alone is read nowhere
    When the atlas is joined to the map
    Then the link for "Iron Ore Node" is "#view=10000,10000,1.77&filters=iron"

  Scenario: An underground link carries the level parameter
    When the atlas is joined to the map
    Then the link for "Coal Node" is "#view=300,300,4&level=1&filters=coal"

  Scenario: A node the artifact does not mention gets no link
    When the atlas is joined to the map
    Then "Soul Stone" gets no link
