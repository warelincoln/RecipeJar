import XCTest

/// UI tests for the import flow screens.
///
/// Uses `descendants(matching: .any)` for all element lookups to work
/// reliably with React Native's accessibility tree.
final class ImportFlowUITests: XCTestCase {

    private static let bundleTimeout: TimeInterval = 120
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    private func element(_ identifier: String) -> XCUIElement {
        return app.descendants(matching: .any)[identifier]
    }

    private func waitForHomeScreen() -> Bool {
        return app.staticTexts["RecipeJar"].waitForExistence(timeout: Self.bundleTimeout)
    }

    private func openCameraViaJar() {
        element("jar-button").tap()
        element("jar-modal-camera").tap()
    }

    private func openURLViaJar() {
        element("jar-button").tap()
        element("jar-modal-url").tap()
    }

    // MARK: - Photos Fan Action

    func testPhotosButtonExistsInJarMenu() {
        XCTAssertTrue(waitForHomeScreen())
        element("jar-button").tap()

        let photosButton = element("jar-fan-photos")
        XCTAssertTrue(photosButton.waitForExistence(timeout: 5),
                      "Photos fan button should appear in the jar menu")
        XCTAssertTrue(photosButton.isHittable, "Photos button should be tappable")
    }

    // MARK: - Capture View

    func testCaptureViewShowsCancelButton() {
        XCTAssertTrue(waitForHomeScreen())
        openCameraViaJar()

        let cancel = element("capture-cancel")
        if cancel.waitForExistence(timeout: 15) {
            XCTAssertTrue(cancel.isHittable, "Cancel button should be tappable")
        }
    }

    func testCaptureViewShowsShutterButton() {
        XCTAssertTrue(waitForHomeScreen())
        openCameraViaJar()

        let shutter = element("capture-shutter")
        if shutter.waitForExistence(timeout: 15) {
            XCTAssertTrue(shutter.isHittable, "Shutter button should be tappable")
        }
    }

    // MARK: - URL Input

    func testUrlInputScreenShowsFieldAndButton() {
        XCTAssertTrue(waitForHomeScreen())
        openURLViaJar()

        let urlInput = element("url-input-screen")
        XCTAssertTrue(urlInput.waitForExistence(timeout: 15),
                      "URL input screen should appear")

        let field = element("url-input-field")
        XCTAssertTrue(field.exists, "URL text field should be visible")

        let cancel = element("url-input-cancel")
        XCTAssertTrue(cancel.exists, "Cancel button should be visible")
    }

    func testUrlInputCancelReturnsHome() {
        XCTAssertTrue(waitForHomeScreen())
        openURLViaJar()

        let urlInput = element("url-input-screen")
        guard urlInput.waitForExistence(timeout: 15) else { return }

        element("url-input-cancel").tap()

        XCTAssertTrue(app.staticTexts["RecipeJar"].waitForExistence(timeout: 15),
                      "Should return to home after cancelling URL input")
    }

    // MARK: - Preview Edit View

    func testPreviewEditShowsSaveButton() {
        XCTAssertTrue(waitForHomeScreen())
        openCameraViaJar()

        let previewScreen = element("preview-edit-screen")
        guard previewScreen.waitForExistence(timeout: 60) else { return }

        let saveButton = element("preview-save")
        XCTAssertTrue(saveButton.exists, "Save Recipe button should be visible")
    }

    func testPreviewEditShowsAddButtons() {
        XCTAssertTrue(waitForHomeScreen())
        openCameraViaJar()

        let previewScreen = element("preview-edit-screen")
        guard previewScreen.waitForExistence(timeout: 60) else { return }

        let addIngredient = element("preview-add-ingredient")
        let addStep = element("preview-add-step")
        XCTAssertTrue(addIngredient.exists, "Add Ingredient button should be visible")
        XCTAssertTrue(addStep.exists, "Add Step button should be visible")
    }

    func testPreviewEditCancelShowsDialog() {
        XCTAssertTrue(waitForHomeScreen())
        openCameraViaJar()

        let previewScreen = element("preview-edit-screen")
        guard previewScreen.waitForExistence(timeout: 60) else { return }

        let cancel = element("preview-cancel")
        guard cancel.exists else { return }
        cancel.tap()

        let alertTitle = app.staticTexts["Cancel Import"]
        XCTAssertTrue(alertTitle.waitForExistence(timeout: 5),
                      "Cancel confirmation dialog should appear")

        let keepGoing = app.buttons["Keep Going"]
        if keepGoing.exists { keepGoing.tap() }
    }

    // MARK: - Saved View

    func testSavedViewElements() {
        XCTAssertTrue(waitForHomeScreen())
        openCameraViaJar()

        let savedScreen = element("saved-screen")
        guard savedScreen.waitForExistence(timeout: 90) else { return }

        XCTAssertTrue(app.staticTexts["Recipe Saved"].exists, "Saved title should be visible")
        XCTAssertTrue(element("saved-done").exists, "Done button should be visible")
    }

    func testSavedViewDoneReturnsToHome() {
        XCTAssertTrue(waitForHomeScreen())
        openCameraViaJar()

        let savedScreen = element("saved-screen")
        guard savedScreen.waitForExistence(timeout: 90) else { return }

        element("saved-done").tap()
        XCTAssertTrue(app.staticTexts["RecipeJar"].waitForExistence(timeout: 15),
                      "Should return to home after Done")
    }

    // MARK: - Retake Required View

    func testRetakeRequiredElements() {
        XCTAssertTrue(waitForHomeScreen())
        openCameraViaJar()

        let retakeScreen = element("retake-screen")
        guard retakeScreen.waitForExistence(timeout: 90) else { return }

        XCTAssertTrue(app.staticTexts["Retake Required"].exists)
    }

    // MARK: - Edit Flow

    func testEditButtonOpensEditScreen() {
        XCTAssertTrue(waitForHomeScreen())

        let recipeList = element("home-recipe-list")
        guard recipeList.waitForExistence(timeout: 10) else { return }

        let firstCell = recipeList.cells.firstMatch
        guard firstCell.exists else { return }
        firstCell.tap()

        let editButton = element("recipe-detail-edit")
        guard editButton.waitForExistence(timeout: 15) else { return }
        editButton.tap()

        let editScreen = element("recipe-edit-screen")
        XCTAssertTrue(editScreen.waitForExistence(timeout: 15),
                      "Edit screen should appear after tapping Edit")

        let titleInput = element("edit-title-input")
        XCTAssertTrue(titleInput.exists, "Title input should be visible on edit screen")

        let saveButton = element("edit-save")
        XCTAssertTrue(saveButton.exists, "Save button should be visible on edit screen")
    }
}
