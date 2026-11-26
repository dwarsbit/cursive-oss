# Changelog

## 0.6.0 (2026-11-26)

- The desktop app works live in projects you share with others, as the browser does: you see their faces and carets, and their changes come in as they type, while every page stays saved in your folder. Projects only you work in sync as before.
- In the browser, the Markdown view shows the carets and selections of the people working with you, with their names, as the page does. A name shows when they type or move, then fades; point at their caret to see it again.
- In the browser, clicking a face in the header opens the page that person is on, and the status line says who is working with you, such as "Live with Anna and Tom". When the connection drops, it says your changes are kept.
- The faces and carets of the people in a project have the same colors as in Polemic.
- Export a page or the whole project as a **Course**: one Common Cartridge file to import in Canvas, Moodle or Brightspace. Pages become pages, with their images and equations, and each page's quizzes, blanks with one gap and exercises become one quiz after it, which the platform grades. Put in order, blanks with several gaps and assignments stay on their page.

## 0.5.0 (2026-11-26)

- Inviting people to a project comes with Pro. The people you invite can be on any plan, Free included. When you move to Plus or Free, the people in your projects keep their access, but you can't invite anyone new; **Share** shows **See plans** instead.
- Dropdowns open Cursive's own list instead of your system's, in the same style as the rest of Cursive: a code block's language, the citation style of your references, a person's role in **Share** and the interface language in **Settings**.
- After `@`, type several words, such as an author, a word from the title and a year: `@stickgold sleep 2005`. The menu searches all of them and closes at a comma or a full stop, at a new line, or when nothing matches, so you can keep writing.
- Scroll bars are slim and rounded, in Cursive's grays, and in dark mode too.

## 0.4.1 (2026-11-26)

- Type `@` and a few words of a title, or an author's name, to cite a paper from OpenAlex's 480 million works. It comes with Plus and Pro and needs your Scholarkit account: Plus finds titles and authors and looks up the rest when you cite, Pro shows each paper's year and journal as you choose.
- **Publish** puts your site on scholark.it, under your username: `scholark.it/@yourname/site-name`. Your first publish makes your username from your name; change it on your account page. `scholark.it/@yourname` lists all your sites.
- Cursive's icon at the top left takes you back to your projects, as in Polemic and Binder: in the browser to your Scholarkit home page, in the desktop app to the list of projects. In the browser it replaces the **Scholarkit home** link.
- In the browser, your avatar is at the top right, as in the desktop app, Polemic and Binder. It opens **Manage account** and **Sign out**.
- **Settings** moved from the top of the page to the bottom of the sidebar, as in Binder.
- While a project opens, you see Cursive's layout with a spinner where the project appears, as in Polemic and Binder.
- In the browser, your projects are at `app.scholarkit.app/cursive/projects`. Links and bookmarks to the old address keep working.
- The menu under your avatar is the same in Cursive, Polemic, Binder and on your Scholarkit home page. It shows your plan, the storage you use, how much of today's cloud compile time you've used and your active review links, with **Upgrade to Plus** on Free and **Upgrade to Pro** on Plus.
- Starting a project looks the same in Cursive, Polemic and Binder: one card with the name, templates as tiles and **Create**. Pick **Blank**, one of four templates or **More templates…** for all of them, on the web and in the desktop app. In the browser the page only makes projects; your projects are on your Scholarkit home page, where you can also rename and delete them. In the desktop app, your recent projects stay under the card.
- The desktop app's **Notes**, **Presentation** and **Tutorial** choices are now **Blank**, **Lecture slides** and the new **Tutorial** template: one lesson with an explanation and a quiz.
- Type `@arXiv:1706.03762` or `@PMID:31452104` to cite a preprint or an article by its arXiv or PubMed ID, as you can with a DOI or an ISBN.
- Looking up a DOI, an ISBN, an arXiv or a PubMed ID now goes through your Scholarkit account, so it needs you to be signed in. Cursive no longer contacts Crossref, Open Library and the other sources itself.
- Site themes come with Plus and Pro. On Free, **Publish** shows the other five themes with a Plus badge and publishes with the Cursive theme. A site published with another theme keeps it until you publish it again.

## 0.4.0 (2026-11-24)

- The plans are now Free, Plus and Pro, with a student price on Plus. Learner accounts and grading on your published sites come with Pro.
- When something goes wrong, Cursive sends us an error report so we can fix it: what failed and where in its code, never your text, file names or email address. In the desktop app, turn it off under **Settings**, in **Error reports**.
- In the desktop app, your Zotero cloud key stays inside the app and goes only to zotero.org. A link that could run code instead of opening a page, mail or Zotero shows as plain text, in footnotes too.
- In the browser, **Scholarkit home** on the list of projects opens your Scholarkit home page. It lists everything in your account, from Binder, Polemic and Cursive, in one place.

## 0.3.1 (2026-11-22)

- The desktop app keeps itself up to date. It checks for a new version when it starts and once a day, downloads it in the background and shows **Update ready**. Choose **Restart now** to install it; your work is saved first. **What’s new** lists the changes. Turn the check off, or check now, under **Settings**, in **Updates**. This version is the last one you download by hand.
- Share a project with others: click Share in the header, enter their email address and choose "Can edit" or "Can read". They get an email with a link to join. As the owner you change someone's role, remove them or cancel an invite in the same dialog; someone you invited sees who is in the project and can leave it. In the desktop app, sync the project to your account first.
- Work on a page together in your browser: changes others make show up as they type, without moving your caret. Their carets and selections show in the page in their color with their name, and the faces of who has the project open show in the header. The desktop app brings others' changes in when it syncs.
- Export a page, a presentation or the whole project as PowerPoint, Word or HTML, next to PDF. Pick the format in the **Export** dialog; Cursive remembers it.
- PowerPoint: each slide becomes a slide with text you can edit, in the same layout, with its speaker notes in PowerPoint's notes. The whole project gives a ZIP file with a PowerPoint file for each presentation.
- Word: headings, lists, tables, images, footnotes and the reference list in Word's own styles, and equations as pictures. A project starts with its contents, and each page starts on a new page.
- HTML: one file that opens in any browser, offline, with the images and typefaces inside it.
- Save a PDF straight to a file, with no print window: choose A4 or Letter for pages, and slides keep their own size. In your browser the PDF comes as a download, made by the server, so sign in first. **Print…** in the **Export** dialog still opens the print window, to print on paper.
- Fixed: the sign-in dialog said **Sign in to Polemic**. It now says **Sign in to Scholarkit**.
- Fixed: Cursive reads and writes only the folders you open as projects, so a page can't make it touch any other folder on your computer.

## 0.3.0 (2026-11-14)

- Start a project from a template: lecture notes, lab report, literature review, research paper, thesis outline, reading notes, conference talk, lecture slides, thesis defense or course module. Pick one with "Start from a template…" on the start screen of the desktop app, or "From a template…" in your browser. The project gets the template's pages, with placeholder text to write over.

## 0.2.0 (2026-11-13)

- Cite a work from Zotero: type `@` in a page and pick it from the Zotero app on your computer or your library at zotero.org. Click a citation to add the pages you cite.
- See the works a page cites in a reference list at its end, in APA style. Add one with `/bibliography`, and remove a work no citation names any more.
- Keep working without Zotero: each work is copied into the page, as a `bibliography` block in its Markdown.
- See when a work changed or was deleted in Zotero, on its citation and in the reference list, and update it from Zotero or keep your copy.
- Connect the Zotero app or a zotero.org library in Settings, with the gear in the header. In the desktop app the zotero.org key is kept in your system's credential store.
- Published sites and PDF exports show citations and the reference list in APA style.
- Add a footnote from the `/` menu, the selection toolbar or with Cmd/Ctrl + Alt + F, or type `^[a note]`. Write the note in the field under its number, with bold, italic, links and `@` citations.
- See a page's footnotes numbered and listed under it. On a slide they sit at the bottom and are numbered per slide. Click a note in the list to change it.
- Footnotes are kept in the Markdown where they are cited, as `^[The note.]`. Numbered notes (`[^1]`) written in other tools are read and become inline notes.
- PDF exports and published sites list a page's footnotes at its end, and a slide's at its bottom.
- Add an image or a file from the `/` menu, or drop or paste it on a page. It is copied into the project's `attachments` folder and written as a Markdown image or link, so other tools show it too.
- Click a file on a page to open it in the app your computer opens it with. In the browser it downloads.
- Sync carries images and other files too, not only pages, and published sites and PDF exports show the images.
- Link to another page: type `[[` and pick it, or add a new page from the menu. A link is written `[[Page title]]`, as Obsidian and other wiki tools read it, and links to a page follow it when it gets another title or moves.
- See the pages that link to a page under it, with the line that links, on the page and on its published site.
- Search every page of a project from the sidebar or with Cmd/Ctrl + Shift + F. Results show where the text is, and open the page with it marked.
- Find text in a page with Cmd/Ctrl + F, in Visual and in Markdown mode, and replace one match or all of them.
- See a page's earlier versions with the history button in the header: Cursive keeps a snapshot while you write, at most every 10 minutes, or each hour for a project in your account. Compare one with the page now and restore it; the page as it was is kept as a snapshot.
- Pick a citation style for a page in its reference list: APA, Chicago (author-date), Harvard, IEEE, MLA or Vancouver. IEEE and Vancouver number the works in the order the page cites them. The style is kept in the front matter as `csl: ieee`, as Pandoc reads it, and published sites and PDF exports use it too.
- Number figures, tables and equations. Turn on "Numbered figure" under an image, add a caption under a table with `/table caption`, or turn on "Numbered equation" under an equation. Its number shows on the page and counts itself as you move things.
- Refer to a figure, table or equation: type `@` and pick it, and the text reads "Figure 2". It is written `@fig-scores` with the ids as Quarto and pandoc-crossref write them: `{#fig-scores}`, `: Caption {#tbl-steps}` and `$$ … $$ {#eq-mean}`. Published sites link the reference to the figure.
- Cite from a BibTeX file: add it in Settings and type `@` to pick a work by its key. The desktop app reads the file again on each search, so an export that keeps itself up to date stays current.
- Look a work up by its DOI or ISBN: type `@` and the DOI or ISBN, and pick the work Crossref or Open Library finds.
- Cite from Zotero group libraries: find the groups you are in with the group button of a Zotero source in Settings, and turn on the ones to search.

## 0.1.0 (2026-11-12)

- Write a page in blocks: text, headings, to-do, bulleted and numbered lists, toggle, quote, callout, table, code with syntax colors, equation and divider.
- Type `/` to pick a block from a menu, and type on to filter it.
- Select text to make it bold, italic, underlined, struck through, inline code, highlighted or a link, or to turn its block into another one.
- Hover a block to add a block under it or drag it to another place. Dragging works in the desktop app too.
- Every block is read from and written to Markdown.
- Switch between Visual and Markdown mode with the buttons in the header or Cmd/Ctrl + /. Markdown mode shows the page as its file, with the title in the front matter.
- Keep a project as notes, presentations and folders: the sidebar lists them as a tree, where you add, open, rename and delete them. A note's file is named after its title.
- Right-click the tree to add a note or presentation, or to rename or delete what you clicked.
- Drag notes in the sidebar to put them in your own order, or onto a folder to move them there. The order is kept in each note's front matter.
- Drag the sidebar's edge to make it wider or narrower.
- Click under the last block of a note to write on its last line.
- See and edit a page's properties under its title. They are the front matter of its file: text, a list such as tags, a date, a number, a checkbox or a link.
- Keep your projects in the desktop app as folders in the Cursive folder in your home folder. The start screen makes a new project that starts with notes, a presentation or a tutorial, lists the projects you opened lately, and renames them or moves them to the trash.
- Open any other folder on your computer as a project with Open folder. Each page is a Markdown file in it, saved as you type, and a page or folder you delete moves to the trash.
- Rename a project by selecting its name at the top of the sidebar. In the desktop app its folder gets the same name.
- Sign in to your Polemic account in the desktop app, with the Sign in button. The sign-in happens in your browser, and Cursive keeps it in your system's credential store.
- Sync a project folder to your account. Changes travel both ways, also the ones you made offline, and two changes to the same page are both kept.
- Select your avatar in the desktop app to see who is signed in, sync the open project or stop syncing it, open your account page, or sign out.
- Open a project from your account on another computer. It gets a folder in your Cursive folder.
- Publish a project as a site with the Publish button: choose its address, publish again to bring it up to date, or unpublish it.
- Open and edit your projects in a browser, at `/cursive` on the Polemic server. What you type is saved to your account as you type.
- Make a presentation with the Add presentation button in the sidebar. The sidebar lists its slides under it, as it lists the pages in a folder: select one to work on it, drag it to another place, or delete it. Close the presentation with its arrow to hide them.
- Write each slide as a 16:9 page of blocks, with a layout (title, title and content, big number or quote) and speaker notes. Type a divider to start the next slide.
- See when a slide holds more than fits, and split it into two slides or make its text smaller.
- Present a presentation full screen with the Present button. The arrow keys and a click move between slides, and Esc ends it.
- A presentation is one Markdown file: slides between dividers, with a slide's layout in a `slide` code block and its notes in a `notes` code block.
- Add a quiz to a page from the `/` menu: a question, its options, which ones are correct, points, attempts and an explanation. In Markdown it is a `quiz` block with YAML inside.
- Add an assignment to a page from the `/` menu: a title, instructions, points and a due date. In Markdown it is an `assignment` block with YAML inside.
- Publish pages with quizzes or assignments as a tutorial: readers check their answers, see their points and mark pages as complete. Their progress is kept in their browser, and the correct answers stay on the server until a quiz is answered.
- Let readers of a tutorial sign in with a Polemic account to keep their progress in their account and hand in assignments as text. This needs a paid plan on the author's side.
- See who signed in to your tutorial from Publish → Learners: their completed pages, quiz points and handed-in work.
- Give a published site a theme in the Publish dialog: Cursive, Journal, Plum, Blueprint, Midnight or Poster. A theme sets the colors, typefaces and shapes of every page, slide and quiz.
- Add more tutorial blocks from the `/` menu: learning goals, key terms, a video, before and after, fill in the blanks, put in order, an exercise with a hint and a model answer, and flashcards. In Markdown each is a block named after it (`goals`, `terms`, `video`, `compare`, `blanks`, `order`, `exercise`, `flashcards`) with YAML inside.
- Give an assignment a rubric: criteria with points that add up to the assignment's points. Tick "Learners can add a file" to take a file next to the text.
- Grade handed-in work from Publish → Learners: give points per criterion of the rubric, or one score, and write feedback. The learner sees the grade on the page. Save a file a learner handed in from the same place.
- Cursive has its own icon, an asterisk on a page, and rust as its color in the app and on published sites with the Cursive theme.
- Export a page, a presentation or the whole project as a PDF with the Export button or Cmd/Ctrl + P. Cursive opens the print window, where you choose “Save as PDF”.
- A presentation becomes a PDF with one slide per page, or with speaker notes: the slides on paper with their notes under them. A whole project starts with a list of its pages, and each page starts on a new sheet.
- Tutorial blocks are printed as a handout: questions without their answers, hints and explanations.
- Rename a page or a presentation by double-clicking it in the sidebar.
- The desktop app on macOS has no title bar: the sidebar and the page use that space, and you drag the window by the top of either.
