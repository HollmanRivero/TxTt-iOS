import Foundation

enum AppConfig {
    // Dette gjør at du kan lese API-nøkkelen fra hvor som helst i appen
    static var apiKey: String {
        // Her sjekker vi Info.plist etter en nøkkel som heter "ApiKey"
        guard let secret = Bundle.main.object(forInfoDictionaryKey: "ApiKey") as? String else {
            // Hvis du har glemt å sette den opp, vil appen krasje i utvikling med en klar beskjed
            fatalError("Fant ikke 'ApiKey' i Info.plist. Sjekk oppsettet ditt!")
        }
        return secret
    }
}