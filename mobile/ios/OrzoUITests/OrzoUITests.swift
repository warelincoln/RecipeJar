import XCTest

/// UI tests for Orzo.
///
/// React Native elements don't always map to expected XCUIElement types.
/// All queries use `descendants(matching: .any)` to reliably find elements
/// by their `testID` / `accessibilityIdentifier` regardless of native type.
final class OrzoUITests: XCTestCase {

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
        let title = app.staticTexts["Orzo"]
        return title.waitForExistence(timeout: Self.bundleTimeout)
    }

    // MARK: - Debug

    func testAAA_DebugDumpHomeScreen() {
        let title = app.staticTexts["Orzo"]
        let loaded = title.waitForExistence(timeout: Self.bundleTimeout)
        if !loaded {
            XCTFail("App did not load within \(Self.bundleTimeout)s. Accessibility tree:\n\(app.debugDescription)")
            return
        }

        print("=== HOME SCREEN ELEMENT TREE ===")
        print(app.debugDescription)
        print("=== END TREE ===")

        let jarButton = app.descendants(matching: .any)["jar-button"]
        print("descendants['jar-button'].exists = \(jarButton.exists)")

        XCTAssertTrue(loaded, "Home screen loaded — check Xcode console for element tree")
    }

    // MARK: - Home Screen

    func testHomeScreenShowsTitle() {
        XCTAssertTrue(waitForHomeScreen(), "Home screen title 'Orzo' should appear")
    }

    func testHomeScreenShowsSubtitle() {
        XCTAssertTrue(waitForHomeScreen())
        XCTAssertTrue(app.staticTexts["Save, Plan, Cook."].exists,
                      "Home screen subtitle should appear")
    }

    func testHomeScreenShowsJarButton() {
        XCTAssertTrue(waitForHomeScreen())
        let jarButton = element("jar-button")
        XCTAssertTrue(jarButton.waitForExistence(timeout: 5),
                      "Jar button should be visible")
    }

    func testHomeScreenShowsEmptyStateOrRecipes() {
        XCTAssertTrue(waitForHomeScreen())
        let emptyState = element("home-empty-state")
        let recipeList = element("home-recipe-list")
        XCTAssertTrue(emptyState.exists || recipeList.exists,
                      "Either empty state or recipe list should be visible")
    }

    // MARK: - Jar Modal

    func testJarButtonOpensModal() {
        XCTAssertTrue(waitForHomeScreen())
        let jarButton = element("jar-button")
        XCTAssertTrue(jarButton.waitForExistence(timeout: 5))
        jarButton.tap()

        let modal = element("jar-modal")
        XCTAssertTrue(modal.waitForExistence(timeout: 5),
                      "Jar modal should appear after tapping jar button")

        let cameraAction = element("jar-modal-camera")
        let urlAction = element("jar-modal-url")
        let collectionAction = element("jar-modal-collection")

        XCTAssertTrue(cameraAction.exists, "Camera action should be visible in modal")
        XCTAssertTrue(urlAction.exists, "URL action should be visible in modal")
        XCTAssertTrue(collectionAction.exists, "Collection action should be visible in modal")
    }

    func testJarModalCameraOpensImportFlow() {
        XCTAssertTrue(waitForHomeScreen())
        element("jar-button").tap()

        let cameraAction = element("jar-modal-camera")
        XCTAssertTrue(cameraAction.waitForExistence(timeout: 5))
        cameraAction.tap()

        let captureCancel = element("capture-cancel")
        let noCameraText = app.staticTexts["No camera device available"]

        let appeared = captureCancel.waitForExistence(timeout: 15)
                    || noCameraText.waitForExistence(timeout: 5)
        XCTAssertTrue(appeared, "Import flow should appear after tapping camera action")
    }

    func testJarModalURLOpensUrlInput() {
        XCTAssertTrue(waitForHomeScreen())
        element("jar-button").tap()

        let urlAction = element("jar-modal-url")
        XCTAssertTrue(urlAction.waitForExistence(timeout: 5))
        urlAction.tap()

        let urlInputScreen = element("url-input-screen")
        XCTAssertTrue(urlInputScreen.waitForExistence(timeout: 15),
                      "URL input screen should appear after tapping URL action")
    }

    // MARK: - Cancel from Import Flow

    func testCancelFromCaptureReturnsHome() {
        XCTAssertTrue(waitForHomeScreen())
        element("jar-button").tap()
        element("jar-modal-camera").tap()

        let cancelButton = element("capture-cancel")
        guard cancelButton.waitForExistence(timeout: 15) else { return }
        cancelButton.tap()

        let cancelImport = app.buttons["Cancel Import"]
        if cancelImport.waitForExistence(timeout: 5) {
            cancelImport.tap()
        }

        XCTAssertTrue(app.staticTexts["Orzo"].waitForExistence(timeout: 15),
                      "Should return to home screen after cancelling")
    }

    // MARK: - Recipe Detail

    func testTappingRecipeCardOpensDetail() {
        XCTAssertTrue(waitForHomeScreen())

        let recipeList = element("home-recipe-list")
        guard recipeList.waitForExistence(timeout: 10) else { return }

        let firstCell = recipeList.cells.firstMatch
        guard firstCell.exists else { return }
        firstCell.tap()

        XCTAssertTrue(app.staticTexts["Ingredients"].waitForExistence(timeout: 15),
                      "Recipe detail should show Ingredients section")
        XCTAssertTrue(app.staticTexts["Steps"].exists,
                      "Recipe detail should show Steps section")
    }

    func testRecipeDetailShowsEditButton() {
        XCTAssertTrue(waitForHomeScreen())

        let recipeList = element("home-recipe-list")
        guard recipeList.waitForExistence(timeout: 10) else { return }

        let firstCell = recipeList.cells.firstMatch
        guard firstCell.exists else { return }
        firstCell.tap()

        let editButton = element("recipe-detail-edit")
        XCTAssertTrue(editButton.waitForExistence(timeout: 15),
                      "Edit button should be visible on recipe detail")
    }

    func testRecipeDetailBackButton() {
        XCTAssertTrue(waitForHomeScreen())

        let recipeList = element("home-recipe-list")
        guard recipeList.waitForExistence(timeout: 10) else { return }

        let firstCell = recipeList.cells.firstMatch
        guard firstCell.exists else { return }
        firstCell.tap()

        let backButton = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(backButton.waitForExistence(timeout: 15))
        backButton.tap()

        XCTAssertTrue(app.staticTexts["Orzo"].waitForExistence(timeout: 15),
                      "Should return to home screen after back")
    }
}
