# TODO:

[] First off, the graph is WAY too dense. I can't see or reead anything - it looks 
like a big blob with a bunch of stuff around it.

[] The skill trees should be a part of the graph as well, so you know 
what skill level you need.

[] In the badges in the top, you can't unselect everything to get a blank screen.

[] when using the isolate tree function, all the nodes in the tree should 
automatically become visible.

[] There should be a selector for the layout algorithm so we can see the graph in different ways.

[] There should be a layout algorithm that shows the graph as a top to bottom tree.

[] I would like for the ability to check off what I have and show only the things 
I can reach. For instance, if I have the sawmill, I will be able to see only the 
things the sawmill can make or enable.

[] the items in the How to make section of the info panel should be clickable and 
would activate the corresponding node.

[] The isolate tree functionality should show the items inouts and outputs all the way until 
there are only leaf nodes left. 

[] There should be some kind of feedback when the layout
is happening so users will knwo when there is a layout
change. Currently, there is no way fo rhte user to knnow
anything is happening. We should really try to get some background
processing or threading done so it doesn't lock up the UI.

[] There should be a number of links and nodes shown somewhere. I think you
should move the DB counts in the right of the header to just under the title and search bar. 
Then show the links and nodes that are shown under the layout selction. Tihs should leave more
room for the category filtering chits.

[] Can you add the layout algorithm name in the layout dropdown, so we know 
which one is being used. We also need a force-directed checkbox to let the 
algorithm know it is force-directed. This force-directed approach may solve the 
issue of the cluster being too tight to read. There is an article on these at
https://blog.js.cytoscape.org/2020/05/11/layouts/ . We need to add several layout 
options/algorithms: tidytree, breadfirst, klay, elk, cola, cise, and more, for testing.
Do a google search for a bunch of these algorithms and we can decide which ones to keep.

[] The changes to the isolate tree are not really useful. Can we add an input below the 
isolate tree button that shows how far deep to go, with a default of 3? It should
show that depth forward and backwards in the tree.

[] I don't know if this is a feedback issue, but when I select a new layout algorithm, the force
directed algorithms continue to calculate layout and the selected algorithm does not appear to 
do anythng.

[x] We should add a toggle for disabling animations for layouts. (add `animate: false` to the layout options) — DONE: **animate** checkbox in the header, persisted.

[] It looks like physics-based layouts are taking forever. We can speed them up by running them in
memory before showing them by adding  `maxIterations: 1000, maxSimulationTime: 3000` to the layout options.
— PARTIAL: each extension exposes a different knob (`numIter` for bilkent/fcose,
`maxSimulationTime`/`maxIterations` for cise/cola/euler); caps are now tuned per preset
(a literal 1000/3000 was measured too tight for 1,408 nodes — cola needs 4s+). For the
full speed-up, use **saved positions** (next item) or **animate off**.

[] We can also have precaclulated layouts for the graphs. The available nodes should be 
able to store a preset config for layouts. I can use the cytoscape desktop app to configure
these, but if you could give me a start with what you think a good heirarchical layout would look like,
please do.
— DONE: `scripts/gen-layouts.mjs` computes snapshots into `site/layouts/manifest.js`
(elk-layered hierarchical + cose-bilkent bundled); the **saved positions** checkbox applies
them instantly. Desktop-authored configs: export positions and add them to the manifest as
`"<algo>": { "<node id>": { "x": …, "y": … } }`.

[] When clicking on the path to.. button, a new panel should show at the top of the graph that allows
the user to search for a node to link to.

[] We have feedback now for layouts, but it is not showing up due to the blocking nature of the layout algorithms.
can you do some research to find out whether we can offload this to a service worker or some other 
thread-like construct?
