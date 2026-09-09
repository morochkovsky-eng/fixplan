"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type NoticeRequest = { kind: "notice"; message: string; title: string }
type ConfirmRequest = {
  kind: "confirm"
  message: string
  title: string
  confirmLabel: string
  resolve: (result: boolean) => void
}
type PromptRequest = {
  kind: "prompt"
  message: string
  title: string
  confirmLabel: string
  resolve: (result: string | null) => void
}
type DialogRequest = NoticeRequest | ConfirmRequest | PromptRequest

type ConfirmOptions = { title?: string; confirmLabel?: string }
type PromptOptions = { title?: string; confirmLabel?: string; defaultValue?: string }

type SystemDialogContextValue = {
  notify: (message: string, title?: string) => void
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>
}

const SystemDialogContext = React.createContext<SystemDialogContextValue | null>(null)

export function SystemDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<DialogRequest | null>(null)
  const [promptValue, setPromptValue] = React.useState("")

  const notify = React.useCallback((message: string, title = "Сообщение") => {
    setRequest({ kind: "notice", message, title })
  }, [])

  const confirm = React.useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setRequest({
        kind: "confirm",
        message,
        title: options.title ?? "Подтвердите действие",
        confirmLabel: options.confirmLabel ?? (message.trim().startsWith("Удалить") ? "Удалить" : "Подтвердить"),
        resolve,
      })
    })
  }, [])

  const prompt = React.useCallback((message: string, options: PromptOptions = {}) => {
    setPromptValue(options.defaultValue ?? "")
    return new Promise<string | null>((resolve) => {
      setRequest({
        kind: "prompt",
        message,
        title: options.title ?? "Введите значение",
        confirmLabel: options.confirmLabel ?? "Сохранить",
        resolve,
      })
    })
  }, [])

  function closeNotice() {
    setRequest(null)
  }

  function resolveConfirm(result: boolean) {
    if (request?.kind !== "confirm") return
    request.resolve(result)
    setRequest(null)
  }

  function resolvePrompt(result: string | null) {
    if (request?.kind !== "prompt") return
    request.resolve(result)
    setRequest(null)
  }

  return (
    <SystemDialogContext.Provider value={{ notify, confirm, prompt }}>
      {children}

      <Dialog open={request?.kind === "notice"} onOpenChange={(open) => !open && closeNotice()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{request?.kind === "notice" ? request.title : "Сообщение"}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {request?.kind === "notice" ? request.message : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={closeNotice}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={request?.kind === "confirm"} onOpenChange={(open) => !open && resolveConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{request?.kind === "confirm" ? request.title : "Подтвердите действие"}</AlertDialogTitle>
            <AlertDialogDescription>
              {request?.kind === "confirm" ? request.message : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveConfirm(false)}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveConfirm(true)}>
              {request?.kind === "confirm" ? request.confirmLabel : "Подтвердить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={request?.kind === "prompt"} onOpenChange={(open) => !open && resolvePrompt(null)}>
        <DialogContent showCloseButton={false}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              resolvePrompt(promptValue.trim() || null)
            }}
          >
            <DialogHeader>
              <DialogTitle>{request?.kind === "prompt" ? request.title : "Введите значение"}</DialogTitle>
              <DialogDescription className="whitespace-pre-line">
                {request?.kind === "prompt" ? request.message : ""}
              </DialogDescription>
            </DialogHeader>
            <Input value={promptValue} onChange={(event) => setPromptValue(event.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => resolvePrompt(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={!promptValue.trim()}>
                {request?.kind === "prompt" ? request.confirmLabel : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SystemDialogContext.Provider>
  )
}

export function useSystemDialog() {
  const context = React.useContext(SystemDialogContext)
  if (!context) throw new Error("useSystemDialog must be used inside SystemDialogProvider")
  return context
}
